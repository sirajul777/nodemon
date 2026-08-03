import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BillingService } from '../billing/billing.service';
import { PaymentStatusChangedEvent as MidtransEvent } from './midtrans/events/payment-status-changed.event';
import { PaymentStatusChangedEvent as DuitkuEvent } from './duitku/events/payment-status-changed.event';
import { MIDTRANS_EVENTS, PaymentPurpose as MidtransPurpose } from './midtrans/midtrans.constants';
import { DUITKU_EVENTS, PaymentPurpose as DuitkuPurpose } from './duitku/duitku.constants';

/**
 * Listens for successful/failed payment events from Midtrans and Duitku
 * and reacts within the app (currently: auto-marks a billing invoice as
 * paid when the payment purpose is `billing_invoice`).
 */
@Injectable()
export class PaymentStatusListener {
  private readonly logger = new Logger(PaymentStatusListener.name);

  constructor(private readonly billingService: BillingService) {}

  @OnEvent(MIDTRANS_EVENTS.PAID)
  async handleMidtransPaid(event: MidtransEvent): Promise<void> {
    const tx = event.transaction;
    if (tx.purpose !== MidtransPurpose.BILLING_INVOICE) return;
    await this.markInvoicePaid(tx.referenceId, 'midtrans', tx.amount);
  }

  @OnEvent(DUITKU_EVENTS.PAID)
  async handleDuitkuPaid(event: DuitkuEvent): Promise<void> {
    const tx = event.transaction;
    if (tx.purpose !== DuitkuPurpose.BILLING_INVOICE) return;
    await this.markInvoicePaid(tx.referenceId, 'duitku', tx.amount);
  }

  @OnEvent(MIDTRANS_EVENTS.FAILED)
  async handleMidtransFailed(event: MidtransEvent): Promise<void> {
    const tx = event.transaction;
    this.logger.log(
      `[payments] Midtrans transaction ${tx.orderId} failed (${tx.status}) — purpose=${tx.purpose} ref=${tx.referenceId}`
    );
  }

  @OnEvent(DUITKU_EVENTS.FAILED)
  async handleDuitkuFailed(event: DuitkuEvent): Promise<void> {
    const tx = event.transaction;
    this.logger.log(
      `[payments] Duitku transaction ${tx.merchantOrderId} failed (${tx.status}) — purpose=${tx.purpose} ref=${tx.referenceId}`
    );
  }

private async markInvoicePaid(
    invoiceId: string,
    gateway: string,
    amount: number
  ): Promise<void> {
    try {
      const invoice = await this.billingService.getInvoice(invoiceId);
      if (!invoice) {
        this.logger.warn(`[payments] Invoice ${invoiceId} not found — skipping`);
        return;
      }
      if (invoice.status === 'paid') return;
      await this.billingService.payInvoice(
        invoiceId,
        `Gateway ${gateway}`,
        `Auto-paid via ${gateway} (Rp ${Number(amount).toLocaleString('id-ID')})`
      );
      this.logger.log(`[payments] Invoice ${invoiceId} auto-marked paid via ${gateway}`);
    } catch (e: any) {
      this.logger.error(
        `[payments] Failed to auto-pay invoice ${invoiceId}: ${e.message}`,
        e.stack
      );
    }
  }
}

