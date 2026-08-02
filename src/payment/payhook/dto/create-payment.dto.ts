import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength
} from 'class-validator';
import { PaymentPurpose } from '../payhook.constants';

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
}

