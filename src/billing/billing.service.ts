import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type BillingType = 'hotspot' | 'pppoe';
export type BillingStatus = 'active' | 'suspended' | 'expired' | 'unpaid';
export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue' | 'cancelled';

export interface BillingCustomer {
  id: string;
  name: string;
  phone?: string;
  telegramId?: string;
  address?: string;
  type: BillingType;
  // MikroTik username (hotspot user / pppoe secret)
  mikrotikUser: string;
  sessionId: string;       // router session
  profile: string;
  price: number;           // monthly price
  billDate: number;        // billing date (1-28) each month
  status: BillingStatus;
  autoDisable: boolean;    // disable MikroTik user if unpaid
  graceDays: number;       // days after bill date before auto-disable
  reminderDays: number[];  // days before bill date to send reminder (e.g. [7,3,1])
  createdAt: string;
  note?: string;
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
  period: string;          // e.g. "April 2026"
  dueDate: string;         // ISO date
  status: InvoiceStatus;
  paidAt?: string;
  paidBy?: string;
  note?: string;
  createdAt: string;
  reminderSent?: string[]; // ISO dates when reminder was sent
}

const DATA_DIR = path.join(process.cwd(), 'data', 'billing');

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  private file(name: string) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    return path.join(DATA_DIR, name);
  }

  // ── Customers ───────────────────────────────────────────────────

  loadCustomers(sessionId?: string): BillingCustomer[] {
    try {
      const f = this.file('customers.json');
      if (fs.existsSync(f)) {
        const all: BillingCustomer[] = JSON.parse(fs.readFileSync(f, 'utf8'));
        return sessionId ? all.filter(c => c.sessionId === sessionId) : all;
      }
    } catch {}
    return [];
  }

  getCustomer(id: string): BillingCustomer | null {
    return this.loadCustomers().find(c => c.id === id) || null;
  }

  saveCustomer(data: Partial<BillingCustomer> & { name: string; mikrotikUser: string; sessionId: string }): BillingCustomer {
    const all = this.loadCustomers();
    const id  = data.id || `CUST-${Date.now()}`;
    const idx = all.findIndex(c => c.id === id);
    const item: BillingCustomer = {
      id,
      name:         data.name,
      phone:        data.phone || '',
      telegramId:   data.telegramId || '',
      address:      data.address || '',
      type:         data.type || 'pppoe',
      mikrotikUser: data.mikrotikUser,
      sessionId:    data.sessionId,
      profile:      data.profile || '',
      price:        Number(data.price) || 0,
      billDate:     Number(data.billDate) || 1,
      status:       data.status || 'active',
      autoDisable:  data.autoDisable !== false,
      graceDays:    Number(data.graceDays) ?? 3,
      reminderDays: data.reminderDays || [7, 3, 1],
      createdAt:    data.createdAt || new Date().toISOString(),
      note:         data.note || '',
    };
    if (idx >= 0) all[idx] = item; else all.push(item);
    fs.writeFileSync(this.file('customers.json'), JSON.stringify(all, null, 2));
    return item;
  }

  deleteCustomer(id: string): boolean {
    const all = this.loadCustomers();
    const newList = all.filter(c => c.id !== id);
    if (newList.length === all.length) return false;
    fs.writeFileSync(this.file('customers.json'), JSON.stringify(newList, null, 2));
    return true;
  }

  // ── Invoices ─────────────────────────────────────────────────────

  loadInvoices(sessionId?: string, customerId?: string): Invoice[] {
    try {
      const f = this.file('invoices.json');
      if (fs.existsSync(f)) {
        let all: Invoice[] = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (sessionId) all = all.filter(i => i.sessionId === sessionId);
        if (customerId) all = all.filter(i => i.customerId === customerId);
        return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
    } catch {}
    return [];
  }

  getInvoice(id: string): Invoice | null {
    return this.loadInvoices().find(i => i.id === id) || null;
  }

  createInvoice(customer: BillingCustomer, period?: string, dueDate?: string): Invoice {
    const now    = new Date();
    const mon    = ['Januari','Februari','Maret','April','Mei','Juni',
                    'Juli','Agustus','September','Oktober','November','Desember'];
    const per    = period || `${mon[now.getMonth()]} ${now.getFullYear()}`;
    const due    = dueDate || this.calcDueDate(customer.billDate);
    const all    = this.loadInvoices();
    const inv: Invoice = {
      id:           `INV-${Date.now()}`,
      customerId:   customer.id,
      customerName: customer.name,
      sessionId:    customer.sessionId,
      type:         customer.type,
      mikrotikUser: customer.mikrotikUser,
      profile:      customer.profile,
      amount:       customer.price,
      period:       per,
      dueDate:      due,
      status:       'unpaid',
      createdAt:    new Date().toISOString(),
      reminderSent: [],
    };
    all.unshift(inv);
    fs.writeFileSync(this.file('invoices.json'), JSON.stringify(all, null, 2));
    return inv;
  }

  payInvoice(id: string, paidBy: string, note?: string): Invoice | null {
    const all  = this.loadInvoices();
    const item = all.find(i => i.id === id);
    if (!item) return null;
    item.status = 'paid';
    item.paidAt = new Date().toISOString();
    item.paidBy = paidBy;
    if (note) item.note = note;
    fs.writeFileSync(this.file('invoices.json'), JSON.stringify(all, null, 2));
    return item;
  }

  markReminderSent(invoiceId: string) {
    const all  = this.loadInvoices();
    const item = all.find(i => i.id === invoiceId);
    if (!item) return;
    if (!item.reminderSent) item.reminderSent = [];
    item.reminderSent.push(new Date().toISOString());
    fs.writeFileSync(this.file('invoices.json'), JSON.stringify(all, null, 2));
  }

  updateInvoiceStatus(id: string, status: InvoiceStatus) {
    const all  = this.loadInvoices();
    const item = all.find(i => i.id === id);
    if (!item) return;
    item.status = status;
    fs.writeFileSync(this.file('invoices.json'), JSON.stringify(all, null, 2));
  }

  // ── Helpers ───────────────────────────────────────────────────────

  calcDueDate(billDate: number): string {
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth(), billDate);
    if (due <= now) due.setMonth(due.getMonth() + 1);
    return due.toISOString().split('T')[0];
  }

  getDaysUntilDue(dueDate: string): number {
    const now  = new Date(); now.setHours(0,0,0,0);
    const due  = new Date(dueDate); due.setHours(0,0,0,0);
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  }

  getStats(sessionId: string) {
    const customers = this.loadCustomers(sessionId);
    const invoices  = this.loadInvoices(sessionId);
    const unpaid    = invoices.filter(i => i.status === 'unpaid' || i.status === 'overdue');
    const thisMonth = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    const paid      = invoices.filter(i => i.status === 'paid' && i.period.includes(String(new Date().getFullYear())));
    const paidIncome = paid.reduce((s, i) => s + i.amount, 0);
    return {
      total: customers.length,
      active: customers.filter(c => c.status === 'active').length,
      suspended: customers.filter(c => c.status === 'suspended').length,
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s, i) => s + i.amount, 0),
      paidThisMonth: paid.length,
      incomeThisMonth: paidIncome,
    };
  }

  // Auto-generate monthly invoices for all customers
  generateMonthlyInvoices(sessionId: string): { created: number; skipped: number } {
    const customers = this.loadCustomers(sessionId).filter(c => c.status === 'active');
    const existing  = this.loadInvoices(sessionId);
    const mon = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
    const now    = new Date();
    const period = `${mon[now.getMonth()]} ${now.getFullYear()}`;
    let created = 0, skipped = 0;

    for (const cust of customers) {
      const already = existing.some(i => i.customerId === cust.id && i.period === period);
      if (already) { skipped++; continue; }
      this.createInvoice(cust, period);
      created++;
    }
    return { created, skipped };
  }

  // Check overdue and return list to disable
  getOverdueCustomers(sessionId: string): { customer: BillingCustomer; invoice: Invoice }[] {
    const customers = this.loadCustomers(sessionId);
    const invoices  = this.loadInvoices(sessionId);
    const result: { customer: BillingCustomer; invoice: Invoice }[] = [];
    const now = new Date(); now.setHours(0,0,0,0);

    for (const inv of invoices) {
      if (inv.status !== 'unpaid') continue;
      const due    = new Date(inv.dueDate); due.setHours(0,0,0,0);
      const cust   = customers.find(c => c.id === inv.customerId);
      if (!cust || !cust.autoDisable) continue;
      const daysLate = Math.round((now.getTime() - due.getTime()) / 86400000);
      if (daysLate >= cust.graceDays) {
        this.updateInvoiceStatus(inv.id, 'overdue');
        result.push({ customer: cust, invoice: inv });
      }
    }
    return result;
  }

  // Get invoices due for reminder
  getRemindableInvoices(sessionId: string): { customer: BillingCustomer; invoice: Invoice; daysLeft: number }[] {
    const customers = this.loadCustomers(sessionId);
    const invoices  = this.loadInvoices(sessionId);
    const result: { customer: BillingCustomer; invoice: Invoice; daysLeft: number }[] = [];

    for (const inv of invoices) {
      if (inv.status !== 'unpaid') continue;
      const cust = customers.find(c => c.id === inv.customerId);
      if (!cust?.telegramId) continue;
      const daysLeft = this.getDaysUntilDue(inv.dueDate);
      if (cust.reminderDays.includes(daysLeft)) {
        // Check not already sent today
        const today = new Date().toISOString().split('T')[0];
        const sentToday = (inv.reminderSent || []).some(s => s.startsWith(today));
        if (!sentToday) result.push({ customer: cust, invoice: inv, daysLeft });
      }
    }
    return result;
  }
}