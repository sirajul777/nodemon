import { Injectable } from '@nestjs/common';
import { BotResellerService } from './bot-reseller.service';

/**
 * Handles Telegram bot commands for reseller mode.
 * Injected into TelegramService.
 */
@Injectable()
export class BotResellerTelegramService {
  constructor(private readonly resellerSvc: BotResellerService) {}

  /**
   * Check if a Telegram user is a registered active reseller.
   */
  getActiveReseller(telegramId: string) {
    const r = this.resellerSvc.getByTelegramId(telegramId);
    if (!r || r.status !== 'active') return null;
    return r;
  }

  /**
   * Handle /daftar command — register as reseller (requires admin approval).
   */
  buildDaftarInfo(telegramId: string, username: string) {
    const existing = this.resellerSvc.getByTelegramId(telegramId);
    if (existing) {
      return {
        text: `✅ Kamu sudah terdaftar sebagai reseller!\n\n👤 Nama: <b>${existing.name}</b>\n🆔 ID: <code>${existing.telegramId}</code>\n💰 Saldo: <b>Rp ${Math.round(existing.saldo).toLocaleString('id-ID')}</b>\n📦 Total Voucher: <b>${existing.totalVoucher}</b>\n📊 Status: <b>${existing.status === 'active' ? '🟢 Aktif' : '🔴 Nonaktif'}</b>`,
        isRegistered: true,
      };
    }
    return {
      text: `📋 Kamu belum terdaftar sebagai reseller.\n\nHubungi admin untuk mendaftar dan dapatkan:\n• Harga khusus reseller\n• Saldo untuk beli voucher\n• Laporan penjualan`,
      isRegistered: false,
    };
  }

  /**
   * Handle /saldo command.
   */
  buildSaldoInfo(telegramId: string) {
    const r = this.resellerSvc.getByTelegramId(telegramId);
    if (!r) return '❌ Kamu belum terdaftar sebagai reseller. Hubungi admin.';
    const logs = this.resellerSvc.loadLogs(r.id).slice(0, 5);
    let text = `💰 <b>Info Saldo Reseller</b>\n\n`;
    text += `👤 ${r.name}\n`;
    text += `💵 Saldo: <b>Rp ${Math.round(r.saldo).toLocaleString('id-ID')}</b>\n`;
    text += `🎟️ Total Voucher: <b>${r.totalVoucher}</b>\n`;
    text += `📈 Total Pendapatan: <b>Rp ${Math.round(r.totalIncome).toLocaleString('id-ID')}</b>\n`;
    if (logs.length) {
      text += `\n📋 <b>Riwayat terakhir:</b>\n`;
      logs.forEach(l => {
        const sign  = l.amount >= 0 ? '+' : '';
        const color = l.amount >= 0 ? '🟢' : '🔴';
        text += `${color} ${sign}Rp ${Math.abs(l.amount).toLocaleString('id-ID')} — ${l.note || l.type}\n`;
      });
    }
    return text;
  }

  /**
   * Try to deduct saldo for a voucher purchase.
   * Returns { ok, reason } 
   */
  canBuy(telegramId: string, price: number): { ok: boolean; reason?: string; reseller?: any } {
    const r = this.resellerSvc.getByTelegramId(telegramId);
    if (!r) return { ok: false, reason: 'Kamu belum terdaftar sebagai reseller.' };
    if (r.status !== 'active') return { ok: false, reason: 'Akun reseller kamu nonaktif. Hubungi admin.' };

    // Apply discount to price
    const finalPrice = this.getResellerPrice(r, price);
    if (r.saldo < finalPrice) {
      return {
        ok: false,
        reason: `Saldo tidak cukup!\n💰 Saldo kamu: Rp ${Math.round(r.saldo).toLocaleString('id-ID')}\n💵 Harga: Rp ${Math.round(finalPrice).toLocaleString('id-ID')}\n\nHubungi admin untuk topup saldo.`,
        reseller: r,
      };
    }
    return { ok: true, reseller: r };
  }

  /**
   * Deduct saldo after successful purchase.
   */
  processPurchase(telegramId: string, price: number, voucherName: string): boolean {
    const r = this.resellerSvc.getByTelegramId(telegramId);
    if (!r) return false;
    const finalPrice = this.getResellerPrice(r, price);
    return this.resellerSvc.deductSaldo(telegramId, finalPrice, `Beli ${voucherName}`);
  }

  /**
   * Get reseller price (apply discount).
   */
  getResellerPrice(reseller: any, basePrice: number): number {
    if (reseller.discount > 0) {
      return Math.round(basePrice * (1 - reseller.discount / 100));
    }
    if (reseller.markup > 0) {
      return basePrice; // markup doesn't affect their cost, it's their profit
    }
    return basePrice;
  }

  /**
   * Build profile list with reseller prices.
   */
  buildProfilReseller(profiles: any[], reseller: any, currency: string, isIndo: boolean) {
    let text = `📦 <b>Daftar Voucher (Harga Reseller)</b>\n\n`;
    let hasItem = false;
    for (const p of profiles) {
      const price = p.sprice || p.price;
      if (!price) continue;
      hasItem = true;
      const resellerPrice = this.getResellerPrice(reseller, price);
      const priceStr = isIndo
        ? `Rp ${Math.round(resellerPrice).toLocaleString('id-ID')}`
        : `${currency} ${resellerPrice.toFixed(2)}`;
      text += `🎫 <b>${p.name}</b>  →  ${priceStr}`;
      if (reseller.discount > 0 && resellerPrice < price) {
        const orig = isIndo ? `Rp ${Math.round(price).toLocaleString('id-ID')}` : `${currency} ${price.toFixed(2)}`;
        text += ` <s>${orig}</s> (-${reseller.discount}%)`;
      }
      if (p.validity) text += `  ⏰ ${p.validity}`;
      text += '\n';
    }
    if (!hasItem) text += 'Tidak ada profile aktif.';
    text += `\n💰 Saldo kamu: <b>Rp ${Math.round(reseller.saldo).toLocaleString('id-ID')}</b>`;
    text += `\n\nKetik /beli untuk membeli voucher.`;
    return text;
  }
}