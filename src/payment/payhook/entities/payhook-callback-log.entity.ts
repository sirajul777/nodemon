import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn
} from 'typeorm';

/**
 * Monitoring log for every webhook received from the PayHook Android app
 * (or any callback source). Used by the admin dashboard's
 * "Monitoring Callback PayHook" feature — the article explicitly calls out
 * that all PayHook-sent data should be recorded so the admin can inspect:
 *   - waktu callback (when)
 *   - nominal pembayaran (amount)
 *   - data transaksi (raw payload)
 *   - status verifikasi (matched order / matched / status)
 */
@Entity('payhook_callback_logs')
export class PayhookCallbackLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Source identifier: 'payhook-app', 'payhook-server', 'manual', ... */
  @Column({ default: 'payhook-app' })
  source: string;

  /** The nominal that arrived in the webhook. */
  @Column({ type: 'int', default: 0 })
  amount: number;

  /** Status as reported by the sender (e.g. 'COMPLETED', 'SUCCESS', 'PENDING'). */
  @Column({ nullable: true })
  status: string;

  /** Whether the amount matched a pending voucher order. */
  @Column({ default: false })
  matched: boolean;

  /** The orderId of the matched voucher order (if any). */
  @Column({ nullable: true })
  matchedOrderId: string;

  /** Human-readable note about what happened when processing this callback. */
  @Column({ type: 'text', nullable: true })
  note: string;

  /** Full raw payload sent by the sender, kept for audit/debugging. */
  @Column({ type: 'text', nullable: true })
  rawPayload: string;

  @CreateDateColumn()
  processedAt: string;
}

