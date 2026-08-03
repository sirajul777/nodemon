import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VoucherOrderEntity } from './entities/voucher-order.entity';
import { PayhookCallbackLogEntity } from './entities/payhook-callback-log.entity';
import { PayhookAppWebhookDto } from './dto/payhook-app-webhook.dto';
import { PayhookNotifierService } from './notifier.service';
import { ConfigService } from '../../config/config.service';
import { MikrotikService } from '../../mikrotik/mikrotik.service';
import { VoucherTypeService } from '../../voucher-types/voucher-type.service';
import { TelegramService } from '../../telegram/telegram.service';
import { PaymentConfigService } from '../payment-config.service';
import { QrisService } from './qris.service';

/**
 * Manages the QRIS GoPay Merchant voucher-selling flow described in the
 * article:
 *
 *   1. Customer picks a voucher package → the server creates an order with
 *      a *unique amount* (price + N-digit unique code, e.g. 10.237).
 *   2. The checkout page shows a dynamic QRIS (GoPay Merchant) + the exact
 *      unique amount.
 *   3. When the customer pays, the PayHook Android app reads the GoPay
 *      Merchant notification and forwards a webhook to our server.
 *   4. The server matches the incoming amount to a PENDING order, marks it
 *      PAID, auto-creates the hotspot voucher on the MikroTik router, and
 *      sends the voucher via Telegram/WhatsApp.
 *
 * If the PayHook phone is off/offline, the admin can use the manual-verify
 * fallback to settle the order and generate the voucher.
 */
@Injectable()
export class VoucherOrderService {
  private readonly logger = new Logger(VoucherOrderService.name);

  /**
   * Collaborator services (optionally injected to avoid hard module wiring).
   * `ConfigService` is @Global, so it is always available. The rest are
   * provided when PayhookModule imports the corresponding modules.
   */
  constructor(
    @InjectRepository(VoucherOrderEntity)
    private readonly orderRepo: Repository<VoucherOrderEntity>,
    @InjectRepository(PayhookCallbackLogEntity)
    private readonly logRepo: Repository<PayhookCallbackLogEntity>,
    private readonly notifier: PayhookNotifierService,
@Optional() private readonly configService?: ConfigService,
    @Optional() private readonly mikrotikService?: MikrotikService,
    @Optional() private readonly voucherTypeService?: VoucherTypeService,
    @Optional() private readonly telegramService?: TelegramService,
    @Optional() private readonly paymentConfigService?: PaymentConfigService,
    @Optional() private readonly qrisService?: QrisService
  ) {}

  // ── Config helpers ────────────────────────────────────────────────

async getUniqueDigits(): Promise<number> {
    let cfg: any = null;
    if (this.paymentConfigService) {
      try {
        cfg = await this.paymentConfigService.getConfig();
      } catch {
        cfg = null;
      }
    }
    // Allow overriding via payment config once wired; default 3.
    const v = cfg?.payhookUniqueDigits;
    const n = parseInt(v, 10);
    return isNaN(n) ? 3 : Math.min(5, Math.max(2, n));
  }

private async getExpiryMinutes(): Promise<number> {
    let cfg: any = null;
    if (this.paymentConfigService) {
      try {
        cfg = await this.paymentConfigService.getConfig();
      } catch {
        cfg = null;
      }
    }
    const v = cfg?.payhookQrisExpiryMinutes;
    const n = parseInt(v, 10);
    return isNaN(n) ? 15 : Math.min(60, Math.max(5, n));
  }

  /** Static GoPay Merchant QRIS from payment config (used to build dynamic QR). */
  private async getStaticQrString(): Promise<string> {
    let cfg: any = null;
    if (this.paymentConfigService) {
      try {
        cfg = await this.paymentConfigService.getConfig();
      } catch {
        cfg = null;
      }
    }
    return cfg?.payhookStaticQris || '';
  }

  /**
   * Build a dynamic QRIS payload for a given order (price + unique code),
   * plus its rendered PNG data-URI. Falls back to the provided qrString or
   * the static merchant QR if no dynamic QR generator is available.
   */
  private async buildDynamicQr(
    order: Pick<VoucherOrderEntity, 'uniqueAmount'>,
    qrString?: string
  ): Promise<{ qrString: string; qrImage: string | null }> {
    let payload = qrString;
    if (!payload) {
      // Try generating a dynamic QRIS from the static merchant QR.
      const staticQr = await this.getStaticQrString();
      if (staticQr && this.qrisService) {
        try {
          payload = this.qrisService.buildDynamicQris(staticQr, order.uniqueAmount);
        } catch (e: any) {
          this.logger.warn(`[QRIS] dynamic QR generation failed: ${e.message}`);
        }
      } else {
        payload = staticQr || '';
      }
    }

    let qrImage: string | null = null;
    if (payload && this.qrisService) {
      try {
        qrImage = await this.qrisService.toDataUrl(payload);
      } catch (e: any) {
        this.logger.warn(`[QRIS] render QR image failed: ${e.message}`);
      }
    }

    return { qrString: payload || '', qrImage };
  }

  // ── Order creation ────────────────────────────────────────────────

  /**
   * Create a voucher order with a unique payment amount.
   * `uniqueCodeDigits` controls the number of trailing digits (default 3).
   */
  async createOrder(params: {
    voucherTypeId?: string;
    profile?: string;
    sessionId?: string;
    customerName?: string;
    phone?: string;
    qrString?: string;
    uniqueCodeDigits?: number;
  }): Promise<VoucherOrderEntity> {
    const {
      voucherTypeId,
      profile: profileParam,
      sessionId,
      customerName,
      phone,
      qrString,
      uniqueCodeDigits
    } = params;

    // Resolve the voucher type (price + profile).
    let voucherName = '';
    let price = 0;
    let profile = profileParam || '';
    let validity = '';

if (voucherTypeId && this.voucherTypeService) {
      const vt = await this.voucherTypeService.getById(voucherTypeId);
      if (!vt) throw new NotFoundException('Voucher type not found');
      voucherName = vt.name;
      price = Math.round(Number(vt.price) || 0);
      profile = vt.profile || profile;
      validity = vt.duration || '';
    }

    if (!price && (params as any).price) {
      // Fallback: allow passing an explicit price.
      price = Math.round(Number((params as any).price) || 0);
    }
    if (!profile) {
      throw new BadRequestException('Voucher profile is required');
    }
    if (price <= 0) {
      throw new BadRequestException('Voucher price must be > 0');
    }

    // Generate the unique code (N digits).
    const digits = uniqueCodeDigits || (await this.getUniqueDigits());
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const uniqueCode = Math.floor(min + Math.random() * (max - min + 1));
    const uniqueAmount = price + uniqueCode;

    const orderId = `QR${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (await this.getExpiryMinutes()) * 60000);

    const { qrString: builtQrString, qrImage } = await this.buildDynamicQr(
      { uniqueAmount },
      qrString
    );

    const order = this.orderRepo.create({
      orderId,
      voucherTypeId: voucherTypeId || null,
      voucherName: voucherName || profile,
      profile,
      sessionId: sessionId || null,
      price,
      uniqueCode,
      uniqueAmount,
      qrString: builtQrString,
      qrImage,
      customerName: customerName || '',
      phone: phone || '',
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      note: validity ? `Validity: ${validity}` : ''
    });

    const saved = await this.orderRepo.save(order);
    this.logger.log(
      `[QRIS] Order ${saved.orderId} created: ${saved.voucherName} → Rp ${saved.uniqueAmount} (price ${saved.price} + code ${saved.uniqueCode})`
    );

    return saved;
  }

  // ── Webhook processing (PayHook Android app) ─────────────────────

  /**
   * Handle a webhook from the PayHook Android app.
   * Steps:
   *   1. Log the raw callback for monitoring.
   *   2. Normalize the amount (accept several field aliases).
   *   3. Match against a PENDING voucher order whose uniqueAmount == amount.
   *   4. If matched → mark PAID, generate the voucher on MikroTik, notify.
   */
  async processAppWebhook(payload: PayhookAppWebhookDto): Promise<{
    matched: boolean;
    orderId?: string;
    status?: string;
    note: string;
  }> {
    const rawPayload = JSON.stringify(payload || {});
    const amount = this.normalizeAmount(payload);

    this.logger.log(
      `[PayHook-App] callback received amount=${amount} raw=${rawPayload}`
    );

    // 1. Persist the callback log first (always record, even unmatched).
    const logEntry = this.logRepo.create({
      source: 'payhook-app',
      amount: amount || 0,
      status: payload.status || (amount ? 'COMPLETED' : 'UNKNOWN'),
      matched: false,
      matchedOrderId: null,
      rawPayload,
      note: 'Received from PayHook Android app'
    });

    if (!amount) {
      logEntry.note = 'No amount found in payload — could not match';
      await this.logRepo.save(logEntry);
      return { matched: false, status: 'UNKNOWN', note: logEntry.note };
    }

    // 2. Find a matching pending order.
    const order = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.status = :status', { status: 'pending' })
      .andWhere('o.uniqueAmount = :amount', { amount })
      .orderBy('o.createdAt', 'ASC')
      .getOne();

    if (!order) {
      logEntry.note = `No pending order with amount ${amount}`;
      await this.logRepo.save(logEntry);
      return { matched: false, status: 'UNMATCHED', note: logEntry.note };
    }

    logEntry.matched = true;
    logEntry.matchedOrderId = order.orderId;

    // 3. Mark paid + generate voucher + notify.
    try {
      const result = await this.settleOrder(order, 'payhook-app');
      logEntry.note = result.note || 'Paid & voucher generated';
      await this.logRepo.save(logEntry);
      return {
        matched: true,
        orderId: order.orderId,
        status: 'PAID',
        note: logEntry.note
      };
    } catch (e: any) {
      logEntry.note = `Matched but settlement failed: ${e.message}`;
      await this.logRepo.save(logEntry);
      this.logger.error(`[QRIS] settle order ${order.orderId} failed: ${e.message}`, e.stack);
      return { matched: true, orderId: order.orderId, status: 'ERROR', note: logEntry.note };
    }
  }

  /**
   * Core settlement: mark the order paid, create the hotspot user on
   * MikroTik, and send notifications. Idempotent (safe to call twice).
   */
  async settleOrder(
    order: VoucherOrderEntity,
    source: string
  ): Promise<{ note: string }> {
    if (order.status === 'paid' && order.voucherUsername) {
      return { note: `Already paid (${order.orderId})` };
    }

    // Generate voucher credentials.
    const { username, password, limitUptime } = await this.generateVoucherCredentials(order);

    // Create the hotspot user on the router (if a session is configured).
    let createdOnRouter = false;
    let routerError = '';
if (order.sessionId && this.configService && this.mikrotikService) {
      try {
        const s = await this.configService.getDecryptedSession(order.sessionId);
        if (s) {
          const client = await this.mikrotikService.createClient(
            s.ip,
            s.user,
            s.password,
            s.port || 8728
          );
          try {
            const params: Record<string, string> = {
              name: username,
              password,
              profile: order.profile
            };
            if (limitUptime) params['limit-uptime'] = limitUptime;
            // Use the on-login validity from the profile meta if present.
            await client.run('/ip/hotspot/user/add', params);
            createdOnRouter = true;
          } finally {
            client.close();
          }
        }
      } catch (e: any) {
        routerError = e.message;
        this.logger.error(
          `[QRIS] failed to create hotspot user ${username} on ${order.sessionId}: ${e.message}`
        );
      }
    }

    // Update the order record.
    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    order.voucherUsername = username;
    order.voucherPassword = password;
    await this.orderRepo.save(order);

    // Notify.
    await this.notifier.sendVoucherToCustomer({
      phone: order.phone,
      voucherName: order.voucherName,
      username,
      password,
      profile: order.profile,
      validity: order.note || ''
    });
    await this.notifier.notifyAdmin({
      title: `💰 Pembayaran QRIS Diterima`,
      message: `Order ${order.orderId} — ${order.voucherName} (Rp ${order.uniqueAmount.toLocaleString('id-ID')})\nVoucher: ${username}/${password}\nRouter: ${order.sessionId || '—'}\nSumber: ${source}`
    });

    // Optionally also notify via Telegram if configured.
if (this.telegramService) {
      try {
        await this.telegramService.sendMessage(
          this.telegramService.getConfig()?.chatId,
          `🎟️ <b>Voucher QRIS Terjual</b>\n\n` +
            `Order: <code>${order.orderId}</code>\n` +
            `Paket: ${order.voucherName}\n` +
            `Nominal: <b>Rp ${order.uniqueAmount.toLocaleString('id-ID')}</b>\n` +
            `Username: <code>${username}</code>\n` +
            `Password: <code>${password}</code>\n` +
            `Router: ${order.sessionId || '—'}\n` +
            `🕐 ${new Date().toLocaleString('id-ID')}`
        );
      } catch (e: any) {
        this.logger.warn(`Telegram notify failed: ${e.message}`);
      }
    }

    const note = [
      `Order ${order.orderId} marked paid`,
      createdOnRouter ? `voucher created on ${order.sessionId}` : '',
      routerError ? `router error: ${routerError}` : ''
    ]
      .filter(Boolean)
      .join(' | ');

    this.logger.log(`[QRIS] ${note}`);
    return { note };
  }

  /**
   * Generate hotspot username/password for an order.
   * Uses the voucher type's code settings if available, else defaults.
   */
  private async generateVoucherCredentials(
    order: VoucherOrderEntity
  ): Promise<{ username: string; password: string; limitUptime?: string }> {
    let length = 6;
    let format = 'upper+digit';
    let userType = 'up';
    let limitUptime = '';

if (order.voucherTypeId && this.voucherTypeService) {
      const vt = await this.voucherTypeService.getById(order.voucherTypeId);
      if (vt) {
        length = vt.codeLength || 6;
        format = vt.codeFormat || 'upper+digit';
        userType = vt.userType || 'up';
        limitUptime = this.parseValidity(vt.duration || '');
      }
    }

    const username = this.randomStr(length, format);
    const password = userType === 'vc' ? username : this.randomStr(length, format);
    return { username, password, limitUptime };
  }

  private parseValidity(val: string): string {
    if (!val) return '';
    val = val.trim().toLowerCase();
    const d = val.match(/^(\d+)d$/);
    if (d) return `${d[1]}d`;
    const h = val.match(/^(\d+)h$/);
    if (h) return `${parseInt(h[1]) * 3600}s`;
    const m = val.match(/^(\d+)m$/);
    if (m) return `${parseInt(m[1]) * 60}s`;
    if (val.includes(':')) return val;
    return '';
  }

  private randomStr(len: number, format: string): string {
    const map: Record<string, string> = {
      'upper+digit': 'ABCDEFGHJKMNPRSTUVWXYZ23456789',
      'lower+digit': 'abcdefghjkmnprstuvwxyz23456789',
      'mixed+digit': 'abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ23456789',
      digit: '23456789',
      alphabet: 'abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ',
      lower: 'abcdefghjkmnprstuvwxyz',
      upper: 'ABCDEFGHJKMNPRSTUVWXYZ'
    };
    const chars = map[format] || map['upper+digit'];
    return Array.from(
      { length: len },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  // ── Manual fallback verification ──────────────────────────────────

  /**
   * Manual verification fallback (used when the PayHook phone is off).
   * Admin confirms payment received → settle the order + generate voucher.
   */
  async markPaidManual(orderId: string): Promise<VoucherOrderEntity> {
    const order = await this.getOrder(orderId);
    if (!order) throw new NotFoundException('Order not found');

    await this.settleOrder(order, 'manual');
    const log = this.logRepo.create({
      source: 'manual',
      amount: order.uniqueAmount,
      status: 'MANUAL',
      matched: true,
      matchedOrderId: order.orderId,
      rawPayload: JSON.stringify({ action: 'manual-verify', by: 'admin' }),
      note: 'Manually verified by admin'
    });
    await this.logRepo.save(log);

    return this.getOrder(orderId);
  }

  // ── Queries ───────────────────────────────────────────────────────

  /**
   * (Re)generate the QR payload + image for an order. Used by the checkout
   * page's fallback call when `qrImage` wasn't ready at order-creation time
   * (e.g. the static QRIS config was saved after the order was created).
   */
  async regenerateQr(orderId: string): Promise<{ qrString: string; qrImage: string | null }> {
    const order = await this.getOrder(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'pending') {
      return { qrString: order.qrString, qrImage: order.qrImage };
    }

    const { qrString, qrImage } = await this.buildDynamicQr(order, order.qrString || undefined);
    order.qrString = qrString;
    order.qrImage = qrImage;
    await this.orderRepo.save(order);
    return { qrString, qrImage };
  }

  async listOrders(status?: string): Promise<VoucherOrderEntity[]> {
    const where = status ? { status } : {};
    return this.orderRepo.find({
      where,
      order: { createdAt: 'DESC' }
    });
  }

  async getOrder(orderId: string): Promise<VoucherOrderEntity | null> {
    return this.orderRepo.findOne({ where: { orderId } });
  }

  async listCallbackLogs(limit = 100): Promise<PayhookCallbackLogEntity[]> {
    return this.logRepo.find({
      order: { processedAt: 'DESC' },
      take: Math.min(Number(limit) || 100, 500)
    });
  }

  async getStats(): Promise<Record<string, any>> {
    const [orders, logs] = await Promise.all([
      this.orderRepo.find(),
      this.logRepo.find()
    ]);
    const byStatus: Record<string, number> = {};
    let totalAmount = 0;
    let paidAmount = 0;
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      totalAmount += o.uniqueAmount;
      if (o.status === 'paid') paidAmount += o.uniqueAmount;
    }
    const today = new Date().toDateString();
    const todayPaid = orders.filter(
      (o) => o.status === 'paid' && new Date(o.paidAt || '').toDateString() === today
    );
    return {
      totalOrders: orders.length,
      byStatus,
      totalAmount,
      paidAmount,
      todayOrders: todayPaid.length,
      todayIncome: todayPaid.reduce((s, o) => s + o.uniqueAmount, 0),
      totalCallbacks: logs.length,
      matchedCallbacks: logs.filter((l) => l.matched).length
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private normalizeAmount(payload: PayhookAppWebhookDto): number | null {
    for (const key of ['amount', 'nominal', 'total', 'price', 'value']) {
      const v = (payload as any)[key];
      if (v === undefined || v === null || v === '') continue;
      const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return null;
  }
}

