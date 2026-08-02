import { PaymentPurpose } from '../payhook.constants';
import { PaymentTransaction } from '../entities/payment-transaction.entity';

/**
 * Emitted on the 'payhook.payment.paid' / 'payhook.payment.failed' events.
 * Listen for this in whichever module owns the thing being paid for
 * (billing, voucher, reseller, ...) and act on `purpose` + `referenceId`.
 *
 * Example listener in a BillingModule:
 *
 *   @OnEvent(PAYHOOK_EVENTS.PAID)
 *   async handlePaid(event: PaymentStatusChangedEvent) {
 *     if (event.transaction.purpose !== PaymentPurpose.BILLING_INVOICE) return;
 *     await this.invoiceService.markPaid(event.transaction.referenceId);
 *   }
 */
export class PaymentStatusChangedEvent {
  constructor(
    public readonly transaction: PaymentTransaction,
    public readonly purpose: PaymentPurpose = transaction.purpose
  ) {}
}

