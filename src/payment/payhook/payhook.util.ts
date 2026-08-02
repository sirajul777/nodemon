import { createHash, createHmac } from 'crypto';

/**
 * PayHook uses HMAC-SHA256 with your secret key to sign callbacks and/or
 * verify requests. The canonical signed string is produced by joining the
 * relevant fields with '|' exactly as PayHook expects.
 *
 * NOTE: adjust `fields` / the join format to match PayHook's documented
 * signing convention. If PayHook instead documents a raw hash (e.g.
 * MD5(partner + order_id + amount + apiKey)), swap this function body and
 * update `verifyCallbackSignature` accordingly. The rest of the module
 * (create / check / state machine) is unaffected.
 */
export function buildCallbackSignature(
  payload: Record<string, any>,
  secretKey: string
): string {
  const raw = [
    payload.order_id,
    payload.status,
    payload.amount,
  ]
    .filter((v) => v !== undefined && v !== null)
    .join('|');
  return createHmac('sha256', secretKey).update(raw).digest('hex');
}

/**
 * Convenience wrapper so the service can verify a PayHook callback even
 * when the payload only contains a `signature` field alongside the
 * standard order/status/amount values.
 */
export function verifyPayhookSignature(
  payload: Record<string, any>,
  secretKey: string
): boolean {
  if (!payload.signature) return false;
  const expected = buildCallbackSignature(payload, secretKey);
  return expected === payload.signature;
}

/**
 * Generates an order_id that is unique, traceable back to its
 * purpose/reference. PayHook accepts alphanumeric and -/_ up to ~50 chars.
 * e.g. "billing_invoice-INV2201-1735689600000"
 */
export function generateOrderId(purpose: string, referenceId: string): string {
  const raw = `${purpose}-${referenceId}-${Date.now()}`;
  return raw.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 50);
}

/** Small hashing helper kept for parity with the other gateways. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

