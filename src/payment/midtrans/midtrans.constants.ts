export const MIDTRANS_MODULE_OPTIONS = 'MIDTRANS_MODULE_OPTIONS';

/**
 * Official Midtrans Core API base URLs.
 * Source: https://docs.midtrans.com/reference/https-request-1
 */
export const MIDTRANS_BASE_URL = {
  sandbox: 'https://api.sandbox.midtrans.com',
  production: 'https://api.midtrans.com'
} as const;

export const MIDTRANS_ENDPOINT = {
  charge: '/v2/charge',
  status: (orderId: string) => `/v2/${orderId}/status`,
  cancel: (orderId: string) => `/v2/${orderId}/cancel`,
  expire: (orderId: string) => `/v2/${orderId}/expire`
} as const;

/**
 * QRIS acquirer choice on Midtrans. Both route to the same universal
 * QRIS network — pick whichever is active on your Midtrans account.
 */
export enum MidtransQrisAcquirer {
  GOPAY = 'gopay',
  AIRPAY_SHOPEE = 'airpay shopee'
}

/**
 * Midtrans transaction_status values relevant to QRIS.
 * https://docs.midtrans.com/reference/transaction-status
 */
export enum MidtransTransactionStatus {
  PENDING = 'pending',
  SETTLEMENT = 'settlement',
  CAPTURE = 'capture',
  DENY = 'deny',
  CANCEL = 'cancel',
  EXPIRE = 'expire',
  REFUND = 'refund',
  PARTIAL_REFUND = 'partial_refund'
}

/** What this payment is being collected for, in the wider app. */
export enum PaymentPurpose {
  BILLING_INVOICE = 'billing_invoice',
  VOUCHER_PURCHASE = 'voucher_purchase',
  RESELLER_TOPUP = 'reseller_topup',
  OTHER = 'other'
}

/** Internal lifecycle status of a payment transaction record. */
export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

/** Event names emitted via EventEmitter2 so other modules can react generically. */
export const MIDTRANS_EVENTS = {
  PAID: 'midtrans.payment.paid',
  FAILED: 'midtrans.payment.failed'
} as const;
