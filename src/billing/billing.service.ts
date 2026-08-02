import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BillingCustomerEntity, BillingType, BillingStatus } from "../database/entities/billing-customer.entity";
import { InvoiceEntity, InvoiceStatus } from "../database/entities/invoice.entity";
import { SettlementEntity } from "../database/entities/settlement.entity";

export type { BillingType, BillingStatus };
export type { InvoiceStatus };

export interface BillingCustomer {
  id: string;
  name: string;
  phone?: string;
  telegramId?: string;
  address?: string;
  type: BillingType;
  // MikroTik username (hotspot user / pppoe secret)
  mikrotikUser: string;
  sessionId: string; // router session
  profile: string;
  price: number; // monthly price
  billDate: number; // billing date (1-28) each month
  status: BillingStatus;
  unsettledCash?: number;
  autoDisable: boolean; // disable MikroTik user if unpaid
  graceDays: number; // days after bill date before auto-disable
  reminderDays: number[]; // days before bill date to send reminder (e.g. [7,3,1])
  createdAt: string;
  note?: string;
}

export interface Settlement {
  id: string;
  collectorId: string;
  collectorName: string;
  sessionId: string;
  amount: number;
  status: "pending" | "verified";
  createdAt: string;
  verifiedAt?: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  sessionId: string;
  type: BillingType;
  mikrotikUser: string;
  profile: string;
  amount: number;
  period: string; // e.g. "April 2026"
  dueDate: string; // ISO date
  status: InvoiceStatus;
  paidAt?: string;
  paidBy?: string;
  note?: string;
  createdAt: string;
  reminderSent?: string[]; // ISO dates when reminder was sent
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(BillingCustomerEntity)
    private readonly customerRepo: Repository<BillingCustomerEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(SettlementEntity)
    private readonly settlementRepo: Repository<SettlementEntity>
  ) {}

  private async customerToModel(e: BillingCustomerEntity): Promise<BillingCustomer> {
    return {
      id: e.id,
      name: e.name,
      phone: e.phone || "",
      telegramId: e.telegramId || "",
      address: e.address || "",
      type: e.type,
      mikrotikUser: e.mikrotikUser,
      sessionId: e.sessionId,
      profile: e.profile || "",
      price: e.price || 0,
      billDate: e.billDate || 1,
      status: e.status,
      unsettledCash: e.unsettledCash,
      autoDisable: e.autoDisable !== false,
      graceDays: e.graceDays ?? 3,
      reminderDays: e.reminderDays || [7, 3, 1],
      createdAt: e.createdAt,
      note: e.note || ""
    };
  }

  private async invoiceToModel(e: InvoiceEntity): Promise<Invoice> {
    return {
      id: e.id,
      customerId: e.customerId,
      customerName: e.customerName,
      sessionId: e.sessionId,
      type: e.type as BillingType,
      mikrotikUser: e.mikrotikUser,
      profile: e.profile || "",
      amount: e.amount || 0,
      period: e.period,
      dueDate: e.dueDate,
      status: e.status,
      paidAt: e.paidAt,
      paidBy: e.paidBy,
      note: e.note,
      createdAt: e.createdAt,
      reminderSent: e.reminderSent || []
    };
  }

  private async settlementToModel(e: SettlementEntity): Promise<Settlement> {
    return {
      id: e.id,
      collectorId: e.collectorId,
      collectorName: e.collectorName,
      sessionId: e.sessionId,
      amount: e.amount || 0,
      status: e.status,
      createdAt: e.createdAt,
      verifiedAt: e.verifiedAt
    };
  }

  // ── Customers ───────────────────────────────────────────────────

  async loadCustomers(sessionId?: string): Promise<BillingCustomer[]> {
    const where = sessionId ? { sessionId } : {};
    const rows = await this.customerRepo.find({ where });
    const result = [];
    for (const r of rows) result.push(await this.customerToModel(r));
    return result;
  }

  async getCustomer(id: string): Promise<BillingCustomer | null> {
    const e = await this.customerRepo.findOne({ where: { id } });
    return e ? this.customerToModel(e) : null;
  }

  async saveCustomer(
    data: Partial<BillingCustomer> & {
      name: string;
      mikrotikUser: string;
      sessionId: string;
    }
  ): Promise<BillingCustomer> {
    const id = data.id || `CUST-${Date.now()}`;
    let entity = await this.customerRepo.findOne({ where: { id } });
    if (!entity) {
      entity = this.customerRepo.create({
        id,
        name: data.name,
        phone: data.phone || "",
        telegramId: data.telegramId || "",
        address: data.address || "",
        type: data.type || "pppoe",
        mikrotikUser: data.mikrotikUser,
        sessionId: data.sessionId,
        profile: data.profile || "",
        price: Number(data.price) || 0,
        billDate: Number(data.billDate) || 1,
        status: data.status || "active",
        autoDisable: data.autoDisable !== false,
        graceDays: Number(data.graceDays) ?? 3,
        reminderDays: data.reminderDays || [7, 3, 1],
        note: data.note || ""
      });
    } else {
      if (data.name !== undefined) entity.name = data.name;
      if (data.phone !== undefined) entity.phone = data.phone;
      if (data.telegramId !== undefined) entity.telegramId = data.telegramId;
      if (data.address !== undefined) entity.address = data.address;
      if (data.type !== undefined) entity.type = data.type;
      if (data.mikrotikUser !== undefined) entity.mikrotikUser = data.mikrotikUser;
      if (data.sessionId !== undefined) entity.sessionId = data.sessionId;
      if (data.profile !== undefined) entity.profile = data.profile;
      if (data.price !== undefined) entity.price = Number(data.price) || 0;
      if (data.billDate !== undefined) entity.billDate = Number(data.billDate) || 1;
      if (data.status !== undefined) entity.status = data.status;
      if (data.unsettledCash !== undefined) entity.unsettledCash = data.unsettledCash;
      if (data.autoDisable !== undefined) entity.autoDisable = data.autoDisable;
      if (data.graceDays !== undefined) entity.graceDays = Number(data.graceDays) ?? 3;
      if (data.reminderDays !== undefined) entity.reminderDays = data.reminderDays;
      if (data.note !== undefined) entity.note = data.note;
    }
    const saved = await this.customerRepo.save(entity);
    return this.customerToModel(saved);
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await this.customerRepo.delete({ id });
    return (result.affected || 0) > 0;
  }

  // ── Invoices ─────────────────────────────────────────────────────

  async loadInvoices(sessionId?: string, customerId?: string): Promise<Invoice[]> {
    let rows = await this.invoiceRepo.find();
    if (sessionId) rows = rows.filter((i) => i.sessionId === sessionId);
    if (customerId) rows = rows.filter((i) => i.customerId === customerId);
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const result = [];
    for (const r of rows) result.push(await this.invoiceToModel(r));
    return result;
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const e = await this.invoiceRepo.findOne({ where: { id } });
    return e ? this.invoiceToModel(e) : null;
  }

  async createInvoice(
    customer: BillingCustomer,
    period?: string,
    dueDate?: string
  ): Promise<Invoice> {
    const now = new Date();
    const mon = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    ];
    const per = period || `${mon[now.getMonth()]} ${now.getFullYear()}`;
    const due = dueDate || this.calcDueDate(customer.billDate);
    const entity = this.invoiceRepo.create({
      id: `INV-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.name,
      sessionId: customer.sessionId,
      type: customer.type,
      mikrotikUser: customer.mikrotikUser,
      profile: customer.profile,
      amount: customer.price,
      period: per,
      dueDate: due,
      status: "unpaid",
      reminderSent: []
    });
    const saved = await this.invoiceRepo.save(entity);
    return this.invoiceToModel(saved);
  }

  async payInvoice(id: string, paidBy: string, note?: string): Promise<Invoice | null> {
    const item = await this.invoiceRepo.findOne({ where: { id } });
    if (!item || item.status === "paid") return null;

    item.status = "paid";
    item.paidAt = new Date().toISOString();
    item.paidBy = paidBy;
    if (note) item.note = note;
    const saved = await this.invoiceRepo.save(item);

    // Otomatis tambahkan ke cash on hand kolektor
    await this.trackCollectorCash(await this.invoiceToModel(saved), paidBy);

    return this.invoiceToModel(saved);
  }

  async markReminderSent(invoiceId: string): Promise<void> {
    const item = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
    if (!item) return;
    if (!item.reminderSent) item.reminderSent = [];
    item.reminderSent.push(new Date().toISOString());
    await this.invoiceRepo.save(item);
  }

  async updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
    const item = await this.invoiceRepo.findOne({ where: { id } });
    if (!item) return;
    item.status = status;
    await this.invoiceRepo.save(item);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  calcDueDate(billDate: number): string {
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth(), billDate);
    if (due <= now) due.setMonth(due.getMonth() + 1);
    return due.toISOString().split("T")[0];
  }

  getDaysUntilDue(dueDate: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  }

  async getStats(sessionId: string) {
    const customers = await this.loadCustomers(sessionId);
    const invoices = await this.loadInvoices(sessionId);
    const unpaid = invoices.filter(
      (i) => i.status === "unpaid" || i.status === "overdue"
    );
    const thisMonth = new Date().toLocaleString("id-ID", {
      month: "long",
      year: "numeric"
    });
    const paid = invoices.filter(
      (i) =>
        i.status === "paid" &&
        i.period.includes(String(new Date().getFullYear()))
    );
    const paidIncome = paid.reduce((s, i) => s + i.amount, 0);
    return {
      total: customers.length,
      active: customers.filter((c) => c.status === "active").length,
      suspended: customers.filter((c) => c.status === "suspended").length,
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s, i) => s + i.amount, 0),
      paidThisMonth: paid.length,
      incomeThisMonth: paidIncome
    };
  }

  // Auto-generate monthly invoices for all customers
  async generateMonthlyInvoices(sessionId: string): Promise<{
    created: number;
    skipped: number;
  }> {
    const customers = (await this.loadCustomers(sessionId)).filter(
      (c) => c.status === "active"
    );
    const existing = await this.loadInvoices(sessionId);
    const mon = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    ];
    const now = new Date();
    const period = `${mon[now.getMonth()]} ${now.getFullYear()}`;
    let created = 0,
      skipped = 0;

    for (const cust of customers) {
      const already = existing.some(
        (i) => i.customerId === cust.id && i.period === period
      );
      if (already) {
        skipped++;
        continue;
      }
      await this.createInvoice(cust, period);
      created++;
    }
    return { created, skipped };
  }

  // Check overdue and return list to disable
  async getOverdueCustomers(
    sessionId: string
  ): Promise<{ customer: BillingCustomer; invoice: Invoice }[]> {
    const customers = await this.loadCustomers(sessionId);
    const invoices = await this.loadInvoices(sessionId);
    const result: { customer: BillingCustomer; invoice: Invoice }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const inv of invoices) {
      if (inv.status !== "unpaid") continue;
      const due = new Date(inv.dueDate);
      due.setHours(0, 0, 0, 0);
      const cust = customers.find((c) => c.id === inv.customerId);
      if (!cust || !cust.autoDisable) continue;
      const daysLate = Math.round((now.getTime() - due.getTime()) / 86400000);
      if (daysLate >= cust.graceDays) {
        await this.updateInvoiceStatus(inv.id, "overdue");
        result.push({ customer: cust, invoice: inv });
      }
    }
    return result;
  }

  // Get invoices due for reminder
  async getRemindableInvoices(
    sessionId: string
  ): Promise<{ customer: BillingCustomer; invoice: Invoice; daysLeft: number }[]> {
    const customers = await this.loadCustomers(sessionId);
    const invoices = await this.loadInvoices(sessionId);
    const result: {
      customer: BillingCustomer;
      invoice: Invoice;
      daysLeft: number;
    }[] = [];

    for (const inv of invoices) {
      if (inv.status !== "unpaid") continue;
      const cust = customers.find((c) => c.id === inv.customerId);
      if (!cust?.telegramId) continue;
      const daysLeft = this.getDaysUntilDue(inv.dueDate);
      if (cust.reminderDays.includes(daysLeft)) {
        // Check not already sent today
        const today = new Date().toISOString().split("T")[0];
        const sentToday = (inv.reminderSent || []).some((s) =>
          s.startsWith(today)
        );
        if (!sentToday) result.push({ customer: cust, invoice: inv, daysLeft });
      }
    }
    return result;
  }

  // ── Settlements ──────────────────────────────────────────────────

  async loadSettlements(sessionId?: string): Promise<Settlement[]> {
    const where = sessionId ? { sessionId } : {};
    const rows = await this.settlementRepo.find({ where });
    const result = [];
    for (const r of rows) result.push(await this.settlementToModel(r));
    return result;
  }

  // Mencatat uang di tangan kolektor saat invoice dibayar
  async trackCollectorCash(invoice: Invoice, paidBy: string): Promise<void> {
    const all = await this.loadCustomers();
    // Cari kolektor berdasarkan nama/ID
    const collector = all.find((c) => c.name === paidBy);

    if (collector) {
      collector.unsettledCash = (collector.unsettledCash || 0) + invoice.amount;
      await this.saveCustomer(collector);
      this.logger.log(`Cash added to ${paidBy}: Rp ${invoice.amount}`);
    }
  }

  async submitSettlement(
    sessionId: string,
    collectorId: string,
    collectorName: string,
    amount: number
  ): Promise<Settlement> {
    const entity = this.settlementRepo.create({
      id: `SET-${Date.now()}`,
      collectorId,
      collectorName,
      sessionId,
      amount,
      status: "pending"
    });
    const saved = await this.settlementRepo.save(entity);
    return this.settlementToModel(saved);
  }

  async verifySettlement(id: string): Promise<boolean> {
    const settle = await this.settlementRepo.findOne({ where: { id } });
    if (!settle) return false;

    settle.status = "verified";
    settle.verifiedAt = new Date().toISOString();
    await this.settlementRepo.save(settle);

    // Kurangi saldo di data customer/kolektor
    const customers = await this.loadCustomers();
    const collectorIdx = customers.findIndex(
      (c) => c.id === settle.collectorId
    );
    if (collectorIdx !== -1) {
      const cust = customers[collectorIdx];
      cust.unsettledCash = (cust.unsettledCash || 0) - settle.amount;
      await this.saveCustomer(cust);
    }
    return true;
  }

  async getUnpaidStats() {
    const invoices = await this.loadInvoices();
    const unpaid = invoices.filter(
      (i) => i.status === "unpaid" || i.status === "overdue"
    );
    return {
      count: unpaid.length,
      total: unpaid.reduce((sum, i) => sum + i.amount, 0)
    };
  }

  async getUnsettledAmount(collectorId: string): Promise<number> {
    const invoices = await this.loadInvoices();
    const paidToMe = invoices.filter(
      (i) => i.paidBy === collectorId && i.status === "paid"
    );

    const settlements = (await this.loadSettlements()).filter(
      (s) => s.collectorId === collectorId && s.status === "verified"
    );
    const totalPaid = paidToMe.reduce((sum, i) => sum + i.amount, 0);
    const totalSettled = settlements.reduce((sum, s) => sum + s.amount, 0);

    return totalPaid - totalSettled;
  }

  async getSettlementHistory(collectorId: string): Promise<Settlement[]> {
    const all = await this.loadSettlements();
    return all.filter((s) => s.collectorId === collectorId);
  }

  async createSettlementReport(data: {
    collectorId: string;
    collectorName: string;
    amount: number;
    date: string;
  }): Promise<Settlement> {
    const entity = this.settlementRepo.create({
      id: `SET-${Date.now()}`,
      collectorId: data.collectorId,
      collectorName: data.collectorName,
      sessionId: "MANUAL", // Setoran manual biasanya gabungan antar session
      amount: data.amount,
      status: "pending",
      createdAt: data.date
    });
    const saved = await this.settlementRepo.save(entity);
    return this.settlementToModel(saved);
  }
}

