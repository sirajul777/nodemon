import { IsOptional, IsString } from 'class-validator';

/**
 * Shape of the JSON/urlencoded body PayHook POSTs to your callback URL.
 *
 * Field names follow PayHook's standard webhook payload:
 *  - order_id  : the payment order id returned at creation time
 *  - reference : PayHook's own reference/transaction id
 *  - status    : 'PENDING' | 'COMPLETED' | 'FAILED'
 *  - amount    : payment amount
 *  - signature : HMAC-SHA256 hex digest used to verify authenticity
 *
 * NOTE: if PayHook sends a different field for the transaction id, the
 * service maps it defensively (reference ?? transaction_id).
 */
export class PayhookCallbackDto {
  @IsString()
  order_id: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  transaction_id?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsString()
  paid_at?: string;

  @IsOptional()
  @IsString()
  transaction_time?: string;
}

