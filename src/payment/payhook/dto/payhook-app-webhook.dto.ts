import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Shape of the webhook the PayHook Android app forwards to your server.
 *
 * The PayHook app reads transaction notifications from GoPay Merchant
 * (and other payment apps) and POSTs them to the callback URL you
 * configure in the app. The exact field names vary by version/app, so this
 * DTO is deliberately permissive — the service normalizes from multiple
 * aliases (`amount`, `nominal`, `total`, `price`, ...).
 *
 * The critical field is `amount`: the server matches it to a pending
 * voucher order's `uniqueAmount` (price + unique code).
 */
export class PayhookAppWebhookDto {
  @IsOptional()
  amount?: any;

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
  timestamp?: string;

  @IsOptional()
  @IsString()
  trx_id?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  order_id?: string;

  /** Any other fields the app sends are preserved in rawPayload for audit. */
  [key: string]: any;
}

