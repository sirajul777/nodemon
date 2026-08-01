import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength
} from 'class-validator';
import { MidtransQrisAcquirer, PaymentPurpose } from '../midtrans.constants';

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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerLastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phoneNumber?: string;

  /** Defaults to the module's configured defaultAcquirer (usually "gopay") if not provided. */
  @IsOptional()
  @IsEnum(MidtransQrisAcquirer)
  acquirer?: MidtransQrisAcquirer;
}
