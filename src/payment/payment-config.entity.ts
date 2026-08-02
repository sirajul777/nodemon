import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Singleton row holding the app's payment gateway configuration.
 * All credentials are stored in the database ONLY (no env fallbacks),
 * matching the requirement to keep every setting manageable from the UI.
 */
@Entity('payment_config')
export class PaymentConfigEntity {
  @PrimaryColumn({ default: 'default' })
  key: string;

  /** 'midtrans' | 'duitku' — used when a payment is created without an explicit gateway. */
  @Column({ default: 'duitku' })
  defaultProvider: string;

  // ── Midtrans ────────────────────────────────────────────────
  @Column({ default: false })
  midtransEnabled: boolean;

  @Column({ default: 'sandbox' })
  midtransEnv: string;

  @Column({ type: 'text', nullable: true })
  midtransServerKey: string;

  @Column({ type: 'text', nullable: true })
  midtransClientKey: string;

  // ── Duitku ──────────────────────────────────────────────────
  @Column({ default: false })
  duitkuEnabled: boolean;

  @Column({ default: 'sandbox' })
  duitkuEnv: string;

  @Column({ type: 'text', nullable: true })
  duitkuMerchantCode: string;

  @Column({ type: 'text', nullable: true })
  duitkuApiKey: string;

  @Column({ type: 'text', nullable: true })
  duitkuCallbackUrl: string;

  @Column({ type: 'text', nullable: true })
  duitkuReturnUrl: string;

  @Column({ default: 10 })
  duitkuExpiryMinutes: number;

  // ── PayHook ─────────────────────────────────────────────────
  @Column({ default: false })
  payhookEnabled: boolean;

  @Column({ default: 'sandbox' })
  payhookEnv: string;

  @Column({ type: 'text', nullable: true })
  payhookApiKey: string;

  @Column({ type: 'text', nullable: true })
  payhookSecretKey: string;

  @Column({ type: 'text', nullable: true })
  payhookPartnerCode: string;

  @Column({ type: 'text', nullable: true })
  payhookCallbackUrl: string;

  @Column({ default: 'QRIS' })
  payhookDefaultMethod: string;
}



