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

  /**
   * Days to keep EXPIRED/FAILED (never-paid) QRIS orders before permanently
   * deleting them from the database. PAID orders are never auto-deleted —
   * this only prunes abandoned/failed carts. 0 disables auto-delete
   * entirely (they just stay marked 'expired' forever).
   */
  @Column({ default: 3 })
  payhookExpiredRetentionDays: number;

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

  // ── PayHook webhook authentication (see https://payhook.freehost.id/#autentikasi) ──

  /** Auth type configured on the PayHook app's webhook: bearer | api_key | basic | none. */
  @Column({ default: 'none' })
  payhookWebhookAuthType: string;

  /** Token/secret PayHook sends (must match the `token` field set in the PayHook app). */
  @Column({ type: 'text', nullable: true })
  payhookWebhookToken: string;

  /** Header name used for `api_key` auth type (PayHook default: X-API-Key). */
  @Column({ default: 'X-API-Key' })
  payhookWebhookHeaderName: string;

  /**
   * Optional HMAC "Secret Key" — when set, PayHook signs every webhook with
   * HMAC-SHA256 (X-Payhook-Signature) and this server verifies it. Strongly
   * recommended for production per PayHook's docs.
   */
  @Column({ type: 'text', nullable: true })
  payhookWebhookSecretKey: string;
}



