import { Logger } from '@nestjs/common';

/**
 * Notification abstraction for the QRIS voucher-selling flow.
 *
 * The article describes two notification channels:
 *  1. Telegram → admin (new transaction, payment success, failed login,
 *     customer balance top-up, important activity).
 *  2. WhatsApp  → customer (payment info, transaction QR, voucher
 *     username/password, purchase info).
 *
 * Implementations may be real (TelegramService, WhatsApp Business API,
 * wa.me deep-link) or a no-op / console logger for environments without
 * those channels configured.
 */
export interface VoucherNotifier {
  /**
   * Send the purchased voucher credentials to the customer.
   * @param phone       customer phone (E.164 or local format)
   * @param voucherName voucher package display name
   * @param username    generated hotspot username
   * @param password    generated hotspot password
   * @param profile     MikroTik profile
   * @param validity    validity string (e.g. "1d", "4h")
   */
  sendVoucherToCustomer(opts: {
    phone?: string;
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): Promise<void>;

  /**
   * Notify admin(s) about a meaningful event.
   */
  notifyAdmin(opts: {
    title: string;
    message: string;
  }): Promise<void>;
}

/**
 * Default implementation: logs to console. Real channels are wired in via
 * TelegramService (lazy) and a wa.me deep-link URL builder for WhatsApp.
 */
export class ConsoleVoucherNotifier implements VoucherNotifier {
  private readonly logger = new Logger('VoucherNotifier');

  async sendVoucherToCustomer(opts: {
    phone?: string;
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): Promise<void> {
    const { phone, voucherName, username, password, profile, validity } = opts;
    const waLink = phone
      ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
          `🎟️ *${voucherName}*\n\n👤 Username: ${username}\n🔑 Password: ${password}\n📦 Profile: ${profile}${validity ? `\n⏰ Masa aktif: ${validity}` : ''}\n\nTerima kasih telah berbelanja!`
        )}`
      : null;
    this.logger.log(
      `[VOUCHER] ${voucherName} → ${username}/${password}${waLink ? ` | WA: ${waLink}` : ''}`
    );
  }

  async notifyAdmin(opts: { title: string; message: string }): Promise<void> {
    this.logger.log(`[ADMIN] ${opts.title}: ${opts.message}`);
  }
}

