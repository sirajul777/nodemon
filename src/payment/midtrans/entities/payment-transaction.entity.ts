import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { PaymentPurpose, PaymentStatus } from '../midtrans.constants';

/**
 * Generic payment transaction record. One row per Midtrans transaction,
 * regardless of what it's paying for (invoice, voucher, top-up, ...).
 * The `purpose` + `referenceId` pair is how the rest of the app maps
 * a paid transaction back to "what do I do now".
 */
@Entity('midtrans_payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  orderId: string;

  /** Midtrans's own transaction id (transaction_id in their API). */
  @Column({ nullable: true })
  transactionId: string;

  @Column({ type: 'simple-enum', enum: PaymentPurpose })
  purpose: PaymentPurpose;

  /** The id of whatever this payment is for: invoice id, voucher order id, reseller id, etc. */
  @Column()
  referenceId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ default: 'gopay' })
  acquirer: string;

  @Column({ type: 'text', nullable: true })
  qrCodeUrl: string;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  /** Raw transaction_status string from Midtrans, kept for audit/debugging. */
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

  /** Raw notification payload from Midtrans, kept for audit/debugging. */
  @Column({ type: 'simple-json', nullable: true })
  rawNotification: Record<string, any>;

  @Column({ nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
