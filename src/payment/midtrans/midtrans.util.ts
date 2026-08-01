import { createHash } from 'crypto';

/**
 * Midtrans Core API uses HTTP Basic Auth with the Server Key as the
 * "username" and an empty password: Authorization: Basic base64(serverKey + ":")
 */
export function buildBasicAuthHeader(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

/**
 * Midtrans HTTP notification (webhook) signature verification.
 * Formula: SHA512(order_id + status_code + gross_amount + serverKey)
 *
 * IMPORTANT: gross_amount must be the exact string as received in the
 * notification body (e.g. "150000.00", with two decimals) — not a
 * number you recompute yourself.
 */
export function buildNotificationSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string
): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

/**
 * Generates an order_id that is unique, traceable back to its
 * purpose/reference. Midtrans allows up to 50 alphanumeric/-/_ characters.
 * e.g. "billing_invoice-INV2201-1735689600000"
 */
export function generateOrderId(purpose: string, referenceId: string): string {
  const raw = `${purpose}-${referenceId}-${Date.now()}`;
  return raw.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 50);
}
