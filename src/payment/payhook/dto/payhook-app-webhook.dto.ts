import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Shape of the webhook the PayHook Android app sends, per the official
 * payload format: https://payhook.freehost.id/#payload
 *
 * ```json
 * {
 *   "event_id": "evt_1752300000000_a1b2c3",
 *   "event_type": "payment.incoming",
 *   "amount": 300000,
 *   "source": "BCA Mobile",
 *   "reference": "PH-1711425600000",
 *   "timestamp": "2026-03-26 10:26:00",
 *   "package_name": "com.bca",
 *   "notification_title": "Uang masuk dari John",
 *   "notification_text": "Rp 300.000,00 sudah masuk ke rekening Anda",
 *   "sent_by": "PayHook"
 * }
 * ```
 *
 * `event_id` is the official idempotency key — PayHook retries failed
 * deliveries with the SAME `event_id`, so the server uses it to avoid
 * double-processing a retried callback.
 *
 * A few older/looser field names (`nominal`, `total`, `trx_id`, `bank`) are
 * still accepted as fallbacks in case of an older PayHook app version or a
 * hand-rolled integration, but the official field names are what's
 * validated and read first.
 */
export class PayhookAppWebhookDto {
  // ── Official PayHook payload fields ──────────────────────────────
  @IsOptional()
  @IsString()
  event_id?: string;

  @IsOptional()
  @IsString()
  event_type?: string;

  @IsOptional()
  amount?: any;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  package_name?: string;

  @IsOptional()
  @IsString()
  notification_title?: string;

  @IsOptional()
  @IsString()
  notification_text?: string;

  @IsOptional()
  @IsString()
  sent_by?: string;

  // ── Backward-compat aliases (older/non-standard senders) ─────────
  @IsOptional()
  nominal?: any;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  bank?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  trx_id?: string;

  @IsOptional()
  @IsString()
  order_id?: string;

  /** Any other fields the app sends are preserved in rawPayload for audit. */
  [key: string]: any;
}
