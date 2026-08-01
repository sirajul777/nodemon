export const DUITKU_MODULE_OPTIONS = 'DUITKU_MODULE_OPTIONS';

/**
 * Official Duitku API base URLs (v2 inquiry / status endpoints).
 * Source: https://docs.duitku.com/api/en/
 */
export const DUITKU_BASE_URL = {
  sandbox: 'https://sandbox.duitku.com/webapi/api/merchant',
  production: 'https://passport.duitku.com/webapi/api/merchant'
} as const;

export const DUITKU_ENDPOINT = {
  createTransaction: '/v2/inquiry',
  checkTransaction: '/transactionStatus'
} as const;

/**
 * Duitku payment method codes relevant to QRIS.
 * "SP" is the standard/general QRIS channel used by most merchants.
 * Use QN/DQ/GQ/SQ only if that specific QRIS provider was explicitly
 * activated on your Duitku merchant dashboard.
 */
export enum DuitkuQrisMethod {
  QRIS_STANDARD = 'SP', // General QRIS (ShopeePay network)
  QRIS_NOBU = 'QN',
  QRIS_DANA = 'DQ',
  QRIS_GUDANG_VOUCHER = 'GQ',
  QRIS_NUSAPAY = 'SQ'
}

/** Duitku callback resultCode values. */
export enum DuitkuResultCode {
  SUCCESS = '00',
  FAILED = '01'
}

/** Duitku transaction status check statusCode values. */
export enum DuitkuStatusCode {
  SUCCESS = '00',
  PROCESS = '01',
  FAILED_OR_EXPIRED = '02'
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
export const DUITKU_EVENTS = {
  PAID: 'duitku.payment.paid',
  FAILED: 'duitku.payment.failed'
} as const;
