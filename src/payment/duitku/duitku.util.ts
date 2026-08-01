import { createHash } from 'crypto';

/**
 * Duitku "create transaction" request signature.
 * Formula: MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
 */
export function buildRequestSignature(
  merchantCode: string,
  merchantOrderId: string,
  paymentAmount: number,
  apiKey: string
): string {
  return createHash('md5')
    .update(`${merchantCode}${merchantOrderId}${paymentAmount}${apiKey}`)
    .digest('hex');
}

/**
 * Duitku "check transaction status" request signature.
 * Formula: MD5(merchantCode + merchantOrderId + apiKey)
 */
export function buildStatusSignature(
  merchantCode: string,
  merchantOrderId: string,
  apiKey: string
): string {
  return createHash('md5')
    .update(`${merchantCode}${merchantOrderId}${apiKey}`)
    .digest('hex');
}

/**
 * Duitku callback signature verification.
 * Formula: MD5(merchantCode + amount + merchantOrderId + apiKey)
 * NOTE the parameter order differs from the request signature above —
 * this is exactly how Duitku's own docs define it, not a typo.
 */
export function buildCallbackSignature(
  merchantCode: string,
  amount: string,
  merchantOrderId: string,
  apiKey: string
): string {
  return createHash('md5')
    .update(`${merchantCode}${amount}${merchantOrderId}${apiKey}`)
    .digest('hex');
}

/**
 * Generates a merchantOrderId that is unique, traceable back to its
 * purpose/reference, and respects Duitku's 50-character limit.
 * e.g. "billing_invoice-INV2201-1735689600000"
 */
export function generateMerchantOrderId(
  purpose: string,
  referenceId: string
): string {
  const raw = `${purpose}-${referenceId}-${Date.now()}`;
  return raw.slice(0, 50);
}
