import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { PaymentPurpose, PaymentStatus } from '../payhook.constants';

/**
 * Generic payment transaction record. One row per PayHook transaction,
 * regardless of what it's paying for (invoice, voucher, top-up, ...).
 * The `purpose` + `referenceId` pair is how the rest of the app maps
 * a paid transaction back to "what do I do now" (e.g. mark invoice
 * paid, generate voucher, add reseller balance).
 */
@Entity('payhook_payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Order id (order_id) returned by PayHook + generated locally at creation. */
  @Index({ unique: true })
  @Column()
  orderId: string;

  /** PayHook's own transaction/reference id, returned in the callback. */
  @Column({ nullable: true })
  reference: string;

  @Column({ type: 'simple-enum', enum: PaymentPurpose })
  purpose: PaymentPurpose;

  /** The id of whatever this payment is for: invoice id, voucher order id, reseller id, etc. */
  @Column()
  referenceId: string;

  @Column({ type: 'int' })
  amount: number;

  /** Payment method: QRIS or gopay (GoPay dynamic QR). */
  @Column({ default: 'QRIS' })
  paymentMethod: string;

  /** Raw QRIS/GoPay QR string (e.g. data URI or qr_string from PayHook). */
  @Column({ type: 'text', nullable: true })
  qrString: string;

  @Column({ nullable: true })
  paymentUrl: string;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  /** Raw status string from PayHook, kept for audit/debugging. */
  @Column({ nullable: true })
  transactionStatus: string;

  @Column({ nullable: true })
  customerName: string;

  @Column({ nullable: true })
  customerEmail: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  productDetails: string;

  /** Raw callback payload from PayHook, kept for audit/debugging. */
  @Column({ type: 'simple-json', nullable: true })
  rawCallback: Record<string, any>;

  @Column({ nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

