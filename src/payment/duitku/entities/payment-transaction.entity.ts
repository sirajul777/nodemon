import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { PaymentPurpose, PaymentStatus } from '../duitku.constants';

/**
 * Generic payment transaction record. One row per Duitku transaction,
 * regardless of what it's paying for (invoice, voucher, top-up, ...).
 * The `purpose` + `referenceId` pair is how the rest of the app maps
 * a paid transaction back to "what do I do now" (e.g. mark invoice
 * paid, generate voucher, add reseller balance).
 */
@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  merchantOrderId: string;

  /** Reference number returned by Duitku after a successful create-transaction call. */
  @Column({ nullable: true })
  reference: string;

  /** Duitku's own transaction id, returned in the payment callback. */
  @Column({ nullable: true })
  publisherOrderId: string;

  @Column({ type: 'enum', enum: PaymentPurpose })
  purpose: PaymentPurpose;

  /** The id of whatever this payment is for: invoice id, voucher order id, reseller id, etc. */
  @Column()
  referenceId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ default: 'SP' })
  paymentMethod: string;

  @Column({ type: 'text', nullable: true })
  qrString: string;

  @Column({ nullable: true })
  paymentUrl: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true })
  customerName: string;

  @Column({ nullable: true })
  customerEmail: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  productDetails: string;

  /** Raw callback payload from Duitku, kept for audit/debugging. */
  @Column({ type: 'jsonb', nullable: true })
  rawCallback: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  expiredAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
