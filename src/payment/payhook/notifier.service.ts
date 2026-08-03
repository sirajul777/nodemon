import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { VoucherNotifier } from './interfaces/notifier.interface';
import { PaymentConfigService } from '../payment-config.service';

/**
 * Real notifier for the PayHook/QRIS voucher flow.
 *
 * Sends the voucher (username/password) to the customer via a WhatsApp
 * gateway (Fonnte or Wablas), configured from `PaymentConfigService`
 * (`payhookWaEnabled`, `payhookWaProvider`, `payhookWaToken`,
 * `payhookWaDomain` — all editable from the payment settings UI, same
 * place as the Midtrans/Duitku credentials).
 *
 * If WhatsApp sending is disabled, unconfigured, or the API call fails,
 * this falls back to logging a `wa.me` deep link — the same behavior the
 * previous `ConsoleVoucherNotifier` had — so nothing breaks when WA isn't
 * set up yet.
 */
@Injectable()
export class PayhookNotifierService implements VoucherNotifier {
  private readonly logger = new Logger(PayhookNotifierService.name);

  constructor(
    private readonly http: HttpService,
    @Optional() private readonly paymentConfigService?: PaymentConfigService,
  ) {}

  private normalizePhone(phone: string): string {
    let p = phone.replace(/[^0-9]/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return p;
  }

  private buildMessage(opts: {
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): string {
    const { voucherName, username, password, profile, validity } = opts;
    return (
      `🎟️ *${voucherName}*\n\n` +
      `👤 Username: ${username}\n` +
      `🔑 Password: ${password}\n` +
      `📦 Profile: ${profile}` +
      `${validity ? `\n⏰ Masa aktif: ${validity}` : ''}\n\n` +
      `Terima kasih telah berbelanja!`
    );
  }

  private async sendFonnte(token: string, phone: string, message: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        'https://api.fonnte.com/send',
        { target: this.normalizePhone(phone), message },
        { headers: { Authorization: token } },
      ),
    );
  }

  private async sendWablas(token: string, domain: string, phone: string, message: string): Promise<void> {
    const base = domain || 'https://console.wablas.com';
    await firstValueFrom(
      this.http.post(
        `${base.replace(/\/+$/, '')}/api/send-message`,
        { phone: this.normalizePhone(phone), message },
        { headers: { Authorization: token } },
      ),
    );
  }

  async sendVoucherToCustomer(opts: {
    phone?: string;
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): Promise<void> {
    const { phone } = opts;
    const message = this.buildMessage(opts);

    const waLink = phone
      ? `https://wa.me/${this.normalizePhone(phone)}?text=${encodeURIComponent(message)}`
      : null;

    if (!phone) {
      this.logger.log(`[VOUCHER] ${opts.voucherName} → ${opts.username}/${opts.password} (no phone provided)`);
      return;
    }

    let cfg: any = null;
    if (this.paymentConfigService) {
      try {
        cfg = await this.paymentConfigService.getConfig();
      } catch {
        cfg = null;
      }
    }

    if (!cfg?.payhookWaEnabled || !cfg?.payhookWaToken) {
      // Not configured — same behavior as before: just log the deep link.
      this.logger.log(`[VOUCHER] ${opts.voucherName} → ${opts.username}/${opts.password} | WA: ${waLink}`);
      return;
    }

    try {
      if (cfg.payhookWaProvider === 'wablas') {
        await this.sendWablas(cfg.payhookWaToken, cfg.payhookWaDomain, phone, message);
      } else {
        await this.sendFonnte(cfg.payhookWaToken, phone, message);
      }
      this.logger.log(`[VOUCHER] WhatsApp voucher sent to ${this.normalizePhone(phone)} via ${cfg.payhookWaProvider}`);
    } catch (e: any) {
      this.logger.error(
        `[VOUCHER] gagal kirim WhatsApp via ${cfg.payhookWaProvider}: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}. Fallback: ${waLink}`,
      );
    }
  }

  async notifyAdmin(opts: { title: string; message: string }): Promise<void> {
    // Admin notifications for this flow already go out via TelegramService
    // in VoucherOrderService.settleOrder — keep this as a plain log to
    // avoid double-notifying.
    this.logger.log(`[ADMIN] ${opts.title}: ${opts.message}`);
  }
}
