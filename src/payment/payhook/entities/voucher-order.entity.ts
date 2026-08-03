import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

/**
 * A voucher purchase order created via the QRIS GoPay Merchant flow
 * (without a conventional payment gateway).
 *
 * Key idea from the article: each order gets a *unique payment amount*
 * (e.g. Rp 10.237 where 237 is the unique code), so when the PayHook
 * Android app forwards a payment notification (webhook), the server can
 * match the incoming amount to this order and auto-generate the voucher
 * on the MikroTik router.
 */
@Entity('voucher_orders')
export class VoucherOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Customer-facing order id (also used for checkout/status lookups). */
  @Index({ unique: true })
  @Column()
  orderId: string;

  @Column({ nullable: true })
  voucherTypeId: string;

  /** Display name of the chosen voucher package (e.g. "VOCER 1K"). */
  @Column()
  voucherName: string;

  /** MikroTik hotspot profile this voucher maps to. */
  @Column()
  profile: string;

  /** Router session id (which MikroTik to create the voucher on). */
  @Column({ nullable: true })
  sessionId: string;

  /** Base price (the voucher's selling price). */
  @Column({ type: 'int', default: 0 })
  price: number;

  /** The unique 3-6 digit code appended to the price to make the amount matchable. */
  @Column({ type: 'int', default: 0 })
  uniqueCode: number;

  /** price + uniqueCode — this is the exact amount the customer must pay. */
  @Column({ type: 'int', default: 0 })
  uniqueAmount: number;

  /** Raw QRIS/GoPay QR string shown on the checkout page. */
  @Column({ type: 'text', nullable: true })
  qrString: string;

  @Column({ nullable: true })
  customerName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: 'pending' })
  status: string; // pending | paid | failed | expired | manual

  /** Generated hotspot username after payment. */
  @Column({ nullable: true })
  voucherUsername: string;

  /** Generated hotspot password after payment. */
  @Column({ nullable: true })
  voucherPassword: string;

  @Column({ nullable: true })
  paidAt: string;

  @Column({ nullable: true })
  expiresAt: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}

