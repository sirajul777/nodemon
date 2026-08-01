import { IsOptional, IsString } from 'class-validator';

/**
 * Shape of the JSON body Midtrans POSTs to your notification URL
 * (configured once in Dashboard > Settings > Configuration, not
 * sent per-request like Duitku's callbackUrl).
 */
export class MidtransNotificationDto {
  @IsString()
  order_id: string;

  @IsString()
  status_code: string;

  @IsString()
  gross_amount: string;

  @IsString()
  signature_key: string;

  @IsString()
  transaction_status: string;

  @IsOptional()
  @IsString()
  transaction_id?: string;

  @IsOptional()
  @IsString()
  payment_type?: string;

  @IsOptional()
  @IsString()
  fraud_status?: string;

  @IsOptional()
  @IsString()
  acquirer?: string;

  @IsOptional()
  @IsString()
  transaction_time?: string;

  @IsOptional()
  @IsString()
  settlement_time?: string;

  @IsOptional()
  @IsString()
  status_message?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
