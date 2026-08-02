export const PAYHOOK_MODULE_OPTIONS = 'PAYHOOK_MODULE_OPTIONS';

/**
 * Official PayHook API base URLs.
 * Sandbox: https://sandbox.payhook.id (for testing)
 * Production: https://app.payhook.id
 */
export const PAYHOOK_BASE_URL = {
  sandbox: 'https://sandbox.payhook.id',
  production: 'https://app.payhook.id'
} as const;

export const PAYHOOK_ENDPOINT = {
  create: '/api/payment/create',
  check: '/api/payment/check'
} as const;

/**
 * Payment methods supported by PayHook.
 *  - QRIS : standard QRIS dynamic QR (scan via any QRIS app)
 *  - GOPAY: GoPay dynamic QR from a GoPay merchant (verified via the
 *           PayHook mobile app). The exact string sent to PayHook's API
 *           can be tuned here once your PayHook account exposes the
 *           supported payment_method values.
 */
export enum PayhookPaymentMethod {
  QRIS = 'QRIS',
  GOPAY = 'gopay'
}

/**
 * Status strings returned by PayHook payment check / callback.
 */
export enum PayhookStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
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
export const PAYHOOK_EVENTS = {
  PAID: 'payhook.payment.paid',
  FAILED: 'payhook.payment.failed'
} as const;

