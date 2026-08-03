import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentConfigEntity } from './payment-config.entity';
import { MidtransModuleOptions } from './midtrans/interfaces/midtrans-module-options.interface';
import { DuitkuModuleOptions } from './duitku/interfaces/duitku-module-options.interface';
import { PayhookModuleOptions } from './payhook/interfaces/payhook-module-options.interface';

/** Mask a secret so it can be safely shown in the UI. */
function mask(value?: string | null): string {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

@Injectable()
export class PaymentConfigService {
  private readonly logger = new Logger(PaymentConfigService.name);

  constructor(
    @InjectRepository(PaymentConfigEntity)
    private readonly configRepo: Repository<PaymentConfigEntity>,
  ) {}

  /** Get the singleton config row, creating it with defaults if needed. */
  async getConfig(): Promise<PaymentConfigEntity> {
    let row = await this.configRepo.findOne({ where: { key: 'default' } });
    if (row) return row;

    const defaults: Partial<PaymentConfigEntity> = {
      key: 'default',
      defaultProvider: 'duitku',
      midtransEnabled: false,
      midtransEnv: 'sandbox',
      midtransServerKey: null,
      midtransClientKey: null,
      duitkuEnabled: false,
      duitkuEnv: 'sandbox',
      duitkuMerchantCode: null,
      duitkuApiKey: null,
      duitkuCallbackUrl: null,
      duitkuReturnUrl: null,
      duitkuExpiryMinutes: 10,
payhookEnabled: false,
      payhookEnv: 'sandbox',
      payhookApiKey: null,
      payhookSecretKey: null,
      payhookPartnerCode: null,
      payhookCallbackUrl: null,
      payhookDefaultMethod: 'QRIS',
      payhookUniqueDigits: 3,
      payhookQrisExpiryMinutes: 15,
      payhookWaEnabled: false,
      payhookWalledGardenHosts: 'cdn.jsdelivr.net, voucher.sysbill.ink',
    };

    try {
      row = this.configRepo.create(defaults as PaymentConfigEntity);
      row = await this.configRepo.save(row);
      return row;
    } catch (e: any) {
      // Race: two async factories can both try to INSERT the singleton row
      // at boot. On a UNIQUE violation, just return whatever exists now.
      if (String(e?.message || '').toLowerCase().includes('unique')) {
        const existing = await this.configRepo.findOne({ where: { key: 'default' } });
        if (existing) return existing;
      }
      throw e;
    }
  }

  /**
   * Persist gateway settings. Masked values (containing '****') sent back
   * from the UI are treated as "unchanged" and skipped.
   */
  async saveConfig(data: Partial<PaymentConfigEntity>): Promise<PaymentConfigEntity> {
    const row = await this.getConfig();

    if (data.defaultProvider !== undefined) {
      if (
        data.defaultProvider === 'midtrans' ||
        data.defaultProvider === 'duitku' ||
        data.defaultProvider === 'payhook'
      ) {
        row.defaultProvider = data.defaultProvider;
      }
    }

    if (data.midtransEnabled !== undefined) row.midtransEnabled = !!data.midtransEnabled;
    if (data.midtransEnv !== undefined) {
      row.midtransEnv = data.midtransEnv === 'production' ? 'production' : 'sandbox';
    }
    if (data.midtransServerKey !== undefined && !String(data.midtransServerKey).includes('****')) {
      row.midtransServerKey = data.midtransServerKey;
    }
    if (data.midtransClientKey !== undefined && !String(data.midtransClientKey).includes('****')) {
      row.midtransClientKey = data.midtransClientKey;
    }

    if (data.duitkuEnabled !== undefined) row.duitkuEnabled = !!data.duitkuEnabled;
    if (data.duitkuEnv !== undefined) {
      row.duitkuEnv = data.duitkuEnv === 'production' ? 'production' : 'sandbox';
    }
    if (data.duitkuMerchantCode !== undefined && !String(data.duitkuMerchantCode).includes('****')) {
      row.duitkuMerchantCode = data.duitkuMerchantCode;
    }
    if (data.duitkuApiKey !== undefined && !String(data.duitkuApiKey).includes('****')) {
      row.duitkuApiKey = data.duitkuApiKey;
    }
    if (data.duitkuCallbackUrl !== undefined) row.duitkuCallbackUrl = data.duitkuCallbackUrl;
    if (data.duitkuReturnUrl !== undefined) row.duitkuReturnUrl = data.duitkuReturnUrl;
    if (data.duitkuExpiryMinutes !== undefined) {
      const mins = Number(data.duitkuExpiryMinutes);
      if (!isNaN(mins)) row.duitkuExpiryMinutes = Math.min(60, Math.max(10, Math.round(mins)));
    }

    if (data.payhookEnabled !== undefined) row.payhookEnabled = !!data.payhookEnabled;
    if (data.payhookEnv !== undefined) {
      row.payhookEnv = data.payhookEnv === 'production' ? 'production' : 'sandbox';
    }
    if (data.payhookApiKey !== undefined && !String(data.payhookApiKey).includes('****')) {
      row.payhookApiKey = data.payhookApiKey;
    }
    if (data.payhookSecretKey !== undefined && !String(data.payhookSecretKey).includes('****')) {
      row.payhookSecretKey = data.payhookSecretKey;
    }
    if (data.payhookPartnerCode !== undefined && !String(data.payhookPartnerCode).includes('****')) {
      row.payhookPartnerCode = data.payhookPartnerCode;
    }
    if (data.payhookCallbackUrl !== undefined) row.payhookCallbackUrl = data.payhookCallbackUrl;
if (data.payhookDefaultMethod !== undefined) {
      row.payhookDefaultMethod = data.payhookDefaultMethod || 'QRIS';
    }

    // ── QRIS GoPay Merchant fields ──────────────────────────
    if (data.payhookUniqueDigits !== undefined) {
      const d = Number(data.payhookUniqueDigits);
      if (!isNaN(d)) row.payhookUniqueDigits = Math.min(5, Math.max(2, Math.round(d)));
    }
    if (data.payhookQrisExpiryMinutes !== undefined) {
      const m = Number(data.payhookQrisExpiryMinutes);
      if (!isNaN(m)) row.payhookQrisExpiryMinutes = Math.min(60, Math.max(5, Math.round(m)));
    }
    if (data.payhookWaEnabled !== undefined) row.payhookWaEnabled = !!data.payhookWaEnabled;
    if (data.payhookWalledGardenHosts !== undefined) {
      row.payhookWalledGardenHosts = data.payhookWalledGardenHosts || '';
    }

    const saved = await this.configRepo.save(row);
    this.logger.log('Payment gateway config updated');
    return saved;
  }

  /** Safe copy for the UI — secrets masked. */
  async getConfigMasked(): Promise<Record<string, any>> {
    const c = await this.getConfig();
    return {
      defaultProvider: c.defaultProvider,
      midtransEnabled: c.midtransEnabled,
      midtransEnv: c.midtransEnv,
      midtransServerKey: mask(c.midtransServerKey),
      midtransClientKey: mask(c.midtransClientKey),
      midtransHasServerKey: !!c.midtransServerKey,
      duitkuEnabled: c.duitkuEnabled,
      duitkuEnv: c.duitkuEnv,
      duitkuMerchantCode: mask(c.duitkuMerchantCode),
      duitkuApiKey: mask(c.duitkuApiKey),
      duitkuHasMerchantCode: !!c.duitkuMerchantCode,
      duitkuHasApiKey: !!c.duitkuApiKey,
      duitkuCallbackUrl: c.duitkuCallbackUrl || '',
      duitkuReturnUrl: c.duitkuReturnUrl || '',
      duitkuExpiryMinutes: c.duitkuExpiryMinutes,
      payhookEnabled: c.payhookEnabled,
      payhookEnv: c.payhookEnv,
      payhookApiKey: mask(c.payhookApiKey),
      payhookSecretKey: mask(c.payhookSecretKey),
      payhookHasApiKey: !!c.payhookApiKey,
      payhookHasSecretKey: !!c.payhookSecretKey,
      payhookPartnerCode: mask(c.payhookPartnerCode),
      payhookHasPartnerCode: !!c.payhookPartnerCode,
payhookCallbackUrl: c.payhookCallbackUrl || '',
      payhookDefaultMethod: c.payhookDefaultMethod || 'QRIS',
      payhookUniqueDigits: c.payhookUniqueDigits,
      payhookQrisExpiryMinutes: c.payhookQrisExpiryMinutes,
      payhookWaEnabled: c.payhookWaEnabled,
      payhookWalledGardenHosts: c.payhookWalledGardenHosts || '',
    };
  }

  /** Options object for MidtransModule.forRootAsync — reads from DB only. */
  async getMidtransOptions(): Promise<MidtransModuleOptions> {
    const c = await this.getConfig();
    return {
      serverKey: c.midtransServerKey || '',
      clientKey: c.midtransClientKey || '',
      env: c.midtransEnv === 'production' ? 'production' : 'sandbox',
      defaultAcquirer: 'gopay',
    };
  }

  /** Options object for DuitkuModule.forRootAsync — reads from DB only. */
  async getDuitkuOptions(): Promise<DuitkuModuleOptions> {
    const c = await this.getConfig();
    return {
      merchantCode: c.duitkuMerchantCode || '',
      apiKey: c.duitkuApiKey || '',
      env: c.duitkuEnv === 'production' ? 'production' : 'sandbox',
      callbackUrl: c.duitkuCallbackUrl || '',
      returnUrl: c.duitkuReturnUrl || '',
      defaultExpiryMinutes: c.duitkuExpiryMinutes || 10,
    };
  }

/** Options object for PayhookModule.forRootAsync — reads from DB only. */
  async getPayhookOptions(): Promise<PayhookModuleOptions> {
    const c = await this.getConfig();
    const method = c.payhookDefaultMethod || 'QRIS';
    return {
      apiKey: c.payhookApiKey || '',
      secretKey: c.payhookSecretKey || '',
      partnerCode: c.payhookPartnerCode || '',
      env: c.payhookEnv === 'production' ? 'production' : 'sandbox',
      callbackUrl: c.payhookCallbackUrl || '',
      defaultMethod: method as 'QRIS' | 'gopay',
    };
  }
}

