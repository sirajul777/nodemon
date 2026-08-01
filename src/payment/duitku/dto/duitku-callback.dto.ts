import { IsOptional, IsString } from 'class-validator';

/**
 * Shape of the POST body Duitku sends to your callbackUrl.
 * Content-Type is application/x-www-form-urlencoded, so every field
 * arrives as a string (including numeric-looking ones).
 */
export class DuitkuCallbackDto {
  @IsString()
  merchantCode: string;

  @IsString()
  amount: string;

  @IsString()
  merchantOrderId: string;

  @IsOptional()
  @IsString()
  productDetail?: string;

  @IsOptional()
  @IsString()
  additionalParam?: string;

  @IsString()
  paymentCode: string;

  /** "00" = success, "01" = failed. */
  @IsString()
  resultCode: string;

  @IsOptional()
  @IsString()
  merchantUserId?: string;

  @IsString()
  reference: string;

  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  publisherOrderId?: string;

  @IsOptional()
  @IsString()
  spUserHash?: string;

  @IsOptional()
  @IsString()
  settlementDate?: string;

  @IsOptional()
  @IsString()
  issuerCode?: string;
}
