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

// ── QRIS GoPay Merchant (PayHook Android app) ──────────────
  /** Number of digits for the unique amount code (default 3). */
  @Column({ default: 3 })
  payhookUniqueDigits: number;

  /** QRIS expiry minutes (default 15). */
  @Column({ default: 15 })
  payhookQrisExpiryMinutes: number;

  /** Whether to send WhatsApp customer notifications. */
  @Column({ default: false })
  payhookWaEnabled: boolean;

  /** WA gateway provider: 'fonnte' | 'wablas'. */
  @Column({ default: 'fonnte' })
  payhookWaProvider: string;

  /** API token/key for the chosen WA gateway provider. */
  @Column({ type: 'text', nullable: true })
  payhookWaToken: string;

  /** Wablas only: your Wablas server domain (e.g. https://console.wablas.com). */
  @Column({ type: 'text', nullable: true })
  payhookWaDomain: string;

  /** Comma-separated hosts to allow in MikroTik walled-garden for QRIS. */
  @Column({ type: 'text', nullable: true })
  payhookWalledGardenHosts: string;

  /** Static GoPay Merchant QRIS string used to build dynamic QRIS payloads. */
  @Column({ type: 'text', nullable: true })
  payhookStaticQris: string;
}



