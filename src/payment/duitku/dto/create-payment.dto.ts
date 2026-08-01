import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { DuitkuQrisMethod, PaymentPurpose } from '../duitku.constants';

export class CreatePaymentDto {
  @IsEnum(PaymentPurpose)
  purpose: PaymentPurpose;

  /** Id of the invoice / voucher order / reseller, etc. this payment is for. */
  @IsString()
  @MaxLength(50)
  referenceId: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  @MaxLength(255)
  productDetails: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phoneNumber?: string;

  /** Defaults to standard QRIS ("SP") if not provided. */
  @IsOptional()
  @IsEnum(DuitkuQrisMethod)
  paymentMethod?: DuitkuQrisMethod;

  /** Minutes until the QR expires. Duitku allows 10–60 for QRIS. */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(60)
  expiryPeriod?: number;
}
