import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PaymentTransaction as MidtransPaymentTransaction } from './midtrans/entities/payment-transaction.entity';
import { PaymentTransaction as DuitkuPaymentTransaction } from './duitku/entities/payment-transaction.entity';

export interface PaymentRecord {
  gateway: 'midtrans' | 'duitku';
  id: string;
  orderId: string;
  reference: string;
  purpose: any;
  referenceId: string;
  amount: number;
  method: string;
  status: any;
  transactionStatus: string;
  customerName: string;
  customerEmail: string;
  phoneNumber: string;
  productDetails: string;
  rawPayload: Record<string, any>;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  qrString?: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  expiredAt?: Date;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(MidtransPaymentTransaction)
    private readonly midtransRepo: Repository<MidtransPaymentTransaction>,
    @InjectRepository(DuitkuPaymentTransaction)
    private readonly duitkuRepo: Repository<DuitkuPaymentTransaction>,
  ) {}

  private toMidtransRecord(e: MidtransPaymentTransaction): PaymentRecord {
    return {
      gateway: 'midtrans',
      id: e.id,
      orderId: e.orderId,
      reference: e.transactionId || '',
      purpose: e.purpose,
      referenceId: e.referenceId,
      amount: e.amount,
      method: e.acquirer,
      status: e.status,
      transactionStatus: e.transactionStatus || '',
      customerName: e.customerName || '',
      customerEmail: e.customerEmail || '',
      phoneNumber: e.phoneNumber || '',
      productDetails: e.productDetails || '',
      rawPayload: e.rawNotification || {},
      paidAt: e.paidAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      qrCodeUrl: e.qrCodeUrl,
    };
  }

  private toDuitkuRecord(e: DuitkuPaymentTransaction): PaymentRecord {
    return {
      gateway: 'duitku',
      id: e.id,
      orderId: e.merchantOrderId,
      reference: e.reference || '',
      purpose: e.purpose,
      referenceId: e.referenceId,
      amount: e.amount,
      method: e.paymentMethod,
      status: e.status,
      transactionStatus: e.status,
      customerName: e.customerName || '',
      customerEmail: e.customerEmail || '',
      phoneNumber: e.phoneNumber || '',
      productDetails: e.productDetails || '',
      rawPayload: e.rawCallback || {},
      paidAt: e.paidAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      qrString: e.qrString,
      paymentUrl: e.paymentUrl,
      expiredAt: e.expiredAt,
    };
  }

  /** Unified transaction list across both gateways, newest first. */
  async listTransactions(filters: {
    gateway?: string;
    status?: string;
    purpose?: string;
    limit?: number;
  } = {}): Promise<PaymentRecord[]> {
    const limit = Math.min(Number(filters.limit) || 100, 500);

    const whereM: any = {};
    const whereD: any = {};
    if (filters.gateway) {
      if (filters.gateway !== 'midtrans') return [];
      whereM.status = filters.status;
      if (filters.purpose) whereM.purpose = filters.purpose;
      const rows = await this.midtransRepo.find({ where: whereM, take: limit, order: { createdAt: 'DESC' } });
      return rows.map((r) => this.toMidtransRecord(r));
    }
    if (filters.status) {
      whereM.status = filters.status;
      whereD.status = filters.status;
    }
    if (filters.purpose) {
      whereM.purpose = filters.purpose;
      whereD.purpose = filters.purpose;
    }

    const [mt, dk] = await Promise.all([
      this.midtransRepo.find({ where: whereM, take: limit, order: { createdAt: 'DESC' } }),
      this.duitkuRepo.find({ where: whereD, take: limit, order: { createdAt: 'DESC' } }),
    ]);

    const merged = [...mt.map((r) => this.toMidtransRecord(r)), ...dk.map((r) => this.toDuitkuRecord(r))];
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return merged.slice(0, limit);
  }

  /** Summary stats across both gateways. */
  async getStats(): Promise<Record<string, any>> {
    const [mt, dk] = await Promise.all([
      this.midtransRepo.find(),
      this.duitkuRepo.find(),
    ]);

    const all = [...mt.map((r) => this.toMidtransRecord(r)), ...dk.map((r) => this.toDuitkuRecord(r))];
    const byStatus: Record<string, number> = {};
    let totalAmount = 0;
    let paidAmount = 0;
    for (const p of all) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      totalAmount += p.amount;
      if (p.status === 'paid') paidAmount += p.amount;
    }
    const today = new Date().toDateString();
    const todayTransactions = all.filter(
      (p) => new Date(p.createdAt).toDateString() === today
    );
    const todayIncome = todayTransactions
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + p.amount, 0);

    return {
      total: all.length,
      totalAmount,
      paidAmount,
      pending: byStatus['pending'] || 0,
      paid: byStatus['paid'] || 0,
      failed: byStatus['failed'] || 0,
      expired: byStatus['expired'] || 0,
      todayTransactions: todayTransactions.length,
      todayIncome,
      byGateway: {
        midtrans: mt.length,
        duitku: dk.length,
      },
    };
  }

  async getTransaction(gateway: string, orderId: string): Promise<PaymentRecord | null> {
    if (gateway === 'midtrans') {
      const e = await this.midtransRepo.findOne({ where: { orderId } });
      return e ? this.toMidtransRecord(e) : null;
    }
    if (gateway === 'duitku') {
      const e = await this.duitkuRepo.findOne({ where: { merchantOrderId: orderId } });
      return e ? this.toDuitkuRecord(e) : null;
    }
    return null;
  }

  async getPaymentMethods(): Promise<{ gateway: string; label: string }[]> {
    return [
      { gateway: 'midtrans', label: 'Midtrans (QRIS)' },
      { gateway: 'duitku', label: 'Duitku (QRIS)' },
    ];
  }
}

