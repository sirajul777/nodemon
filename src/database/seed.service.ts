import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';

import { AppConfigEntity } from './entities/config.entity';
import { RouterSessionEntity } from './entities/router-session.entity';
import { UserEntity } from './entities/user.entity';
import { ResellerEntity } from './entities/reseller.entity';
import { BillingCustomerEntity } from './entities/billing-customer.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { SettlementEntity } from './entities/settlement.entity';
import { VoucherBatchEntity } from './entities/voucher-batch.entity';
import { VoucherTypeEntity } from './entities/voucher-type.entity';
import { BotResellerEntity } from './entities/bot-reseller.entity';
import { TopupLogEntity } from './entities/topup-log.entity';
import { MobileTokenEntity } from './entities/mobile-token.entity';
import { TelegramConfigEntity } from './entities/telegram-config.entity';
import { TopupRequestEntity } from './entities/topup-request.entity';
import { ProfileMetaEntity } from './entities/profile-meta.entity';
import { PaymentConfigEntity } from '../payment/payment-config.entity';

const DATA_DIR = path.join(process.cwd(), 'data');

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeedService.name);

  /**
   * Auto-run seeding on every app startup.
   * - Runs after the DB connection + all modules are initialized.
   * - Idempotent: every table seeder skips when the target table already has
   *   rows, so it never overwrites existing data.
   * - Scans these locations for legacy MikHMon JSON data (drop files there and restart):
   *   data/config.json, data/users.json, data/resellers.json,
   *   data/billing/customers.json, data/billing/invoices.json, data/billing/settlements.json,
   *   data/voucher-types.json, data/batches/*.json, data/bot-resellers.json,
   *   data/bot-topup-log.json, data/mobile-user-tokens.json, data/topup-requests.json,
   *   data/profile-meta.json, data/pppoe-profile-meta.json, telegram.json (project root)
   */
  async onApplicationBootstrap() {
    try {
      await this.seed();
    } catch (e: any) {
      this.logger.error(`Seeding failed: ${e.message}`, e.stack);
    }
  }

  constructor(
    @InjectRepository(AppConfigEntity) private configRepo: Repository<AppConfigEntity>,
    @InjectRepository(RouterSessionEntity) private sessionRepo: Repository<RouterSessionEntity>,
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    @InjectRepository(ResellerEntity) private resellerRepo: Repository<ResellerEntity>,
    @InjectRepository(BillingCustomerEntity) private custRepo: Repository<BillingCustomerEntity>,
    @InjectRepository(InvoiceEntity) private invRepo: Repository<InvoiceEntity>,
    @InjectRepository(SettlementEntity) private settleRepo: Repository<SettlementEntity>,
    @InjectRepository(VoucherBatchEntity) private batchRepo: Repository<VoucherBatchEntity>,
    @InjectRepository(VoucherTypeEntity) private vtypeRepo: Repository<VoucherTypeEntity>,
    @InjectRepository(BotResellerEntity) private botRepo: Repository<BotResellerEntity>,
    @InjectRepository(TopupLogEntity) private topupLogRepo: Repository<TopupLogEntity>,
    @InjectRepository(MobileTokenEntity) private tokenRepo: Repository<MobileTokenEntity>,
    @InjectRepository(TelegramConfigEntity) private tgRepo: Repository<TelegramConfigEntity>,
    @InjectRepository(TopupRequestEntity) private topupReqRepo: Repository<TopupRequestEntity>,
    @InjectRepository(ProfileMetaEntity) private metaRepo: Repository<ProfileMetaEntity>,
    @InjectRepository(PaymentConfigEntity) private payConfigRepo: Repository<PaymentConfigEntity>,
  ) {}

  async seed() {
    await this.seedConfig();
    await this.seedSessions();
    await this.seedUsers();
    await this.seedResellers();
    await this.seedBilling();
    await this.seedVoucherTypes();
    await this.seedBatches();
    await this.seedBotResellers();
    await this.seedTopupLogs();
    await this.seedMobileTokens();
    await this.seedTelegramConfig();
    await this.seedTopupRequests();
    await this.seedProfileMeta();
    await this.seedPaymentConfig();
    this.logger.log('✅ Database seeding complete (JSON → SQLite)');
  }

  private readJSON(filePath: string): any {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e: any) {
      this.logger.warn(`Could not read ${filePath}: ${e.message}`);
    }
    return null;
  }

  private async upsert(repo: Repository<any>, data: any, idField = 'id') {
    if (!data) return;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item[idField]) {
          await repo.save(item);
        }
      }
    } else if (typeof data === 'object' && data[idField]) {
      await repo.save(data);
    }
  }

  // ── 1. App Config (config.json) ─────────────────────────────────
  private async seedConfig() {
    const cfg = this.readJSON(path.join(DATA_DIR, 'config.json'));
    if (!cfg) return;
    const count = await this.configRepo.count();
    if (count > 0) return;
    await this.configRepo.save({
      key: 'default',
      adminUser: cfg.adminUser || 'mikhmon',
      adminPass: cfg.adminPass || '',
      currency: 'Rp',
    });
    this.logger.log('Seeded: app_config');
  }

  // ── 2. Router Sessions (config.json.sessions) ───────────────────
  private async seedSessions() {
    const cfg = this.readJSON(path.join(DATA_DIR, 'config.json'));
    if (!cfg?.sessions) return;
    const count = await this.sessionRepo.count();
    if (count > 0) return;
    const sessions = Object.values(cfg.sessions) as any[];
    for (const s of sessions) {
      await this.sessionRepo.save({
        id: s.id || s.name?.replace(/\s+/g, '_').toUpperCase(),
        name: s.name || s.id || 'Unknown',
        ip: s.ip || '0.0.0.0',
        port: s.port || 8728,
        user: s.user || 'admin',
        password: s.password || '',
        hotspotName: s.hotspotName || '',
        dnsName: s.dnsName || '',
        currency: s.currency || 'Rp',
        reloadInterval: s.reloadInterval || 10,
        iface: s.iface || 'ether1',
        idleTo: s.idleTo || 0,
        livereport: s.livereport || 'enable',
      });
    }
    this.logger.log(`Seeded: ${sessions.length} router_sessions`);
  }

  // ── 3. Users (users.json) ──────────────────────────────────────
  // Multi-user table uses bcrypt hashes (see UserService.validate), so any
  // plain-text passwords from legacy JSON are hashed on import. If no
  // users.json exists, a default admin (mikhmon / 1234) is created so the
  // users table is never empty and login works via the multi-user system.
  private async seedUsers() {
    const count = await this.userRepo.count();
    if (count > 0) return;

    const imported = this.readJSON(path.join(DATA_DIR, 'users.json'));
    const list = (Array.isArray(imported) && imported.length
      ? imported
      : [{
          id: 'USR-ADMIN',
          username: 'mikhmon',
          password: '1234',
          name: 'mikhmon',
          role: 'admin',
          active: true,
          allowedSessions: [],
          permissions: {
            viewDashboard: true,
            manageVoucher: true,
            manageBilling: true,
            manageReseller: true,
            managePppoe: true,
            manageHotspot: true,
            viewReport: true,
            manageSystem: true,
          },
        }]) as any[];

    for (const u of list) {
      const plain = String(u.password || '');
      const isBcrypt = /^\$2[aby]\$\d{2}\$/.test(plain);
      const passHash = isBcrypt ? plain : await bcrypt.hash(plain, 10);
      await this.userRepo.save({
        id: u.id || `USR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        username: u.username,
        password: passHash,
        name: u.name || u.username,
        role: u.role || 'reseller',
        active: u.active !== false,
        allowedSessions: u.allowedSessions || [],
        permissions: u.permissions || null,
        createdAt: u.createdAt || new Date().toISOString(),
        lastLogin: u.lastLogin || null,
        note: u.note || null,
      });
    }
    this.logger.log(`Seeded: ${list.length} users`);
  }

  // ── 4. Resellers (resellers.json) ──────────────────────────────
  private async seedResellers() {
    const data = this.readJSON(path.join(DATA_DIR, 'resellers.json'));
    if (!data) return;
    const count = await this.resellerRepo.count();
    if (count > 0) return;
    const items = Object.values(data) as any[];
    for (const r of items) {
      await this.resellerRepo.save({
        id: r.id,
        name: r.name,
        phone: r.phone || null,
        address: r.address || null,
        discount: r.discount || 0,
        createdAt: r.createdAt || new Date().toISOString(),
        router: r.router || null,
      });
    }
    this.logger.log(`Seeded: ${items.length} resellers`);
  }

  // ── 5. Billing (billing/*.json) ────────────────────────────────
  private async seedBilling() {
    const billingDir = path.join(DATA_DIR, 'billing');
    if (!fs.existsSync(billingDir)) return;

    // Customers
    const customers: any[] = this.readJSON(path.join(billingDir, 'customers.json'));
    if (customers?.length) {
      const count = await this.custRepo.count();
      if (count === 0) {
        for (const c of customers) {
          await this.custRepo.save({
            id: c.id,
            name: c.name,
            phone: c.phone || null,
            telegramId: c.telegramId || null,
            address: c.address || null,
            type: c.type || 'pppoe',
            mikrotikUser: c.mikrotikUser,
            sessionId: c.sessionId,
            profile: c.profile || '',
            price: c.price || 0,
            billDate: c.billDate || 1,
            status: c.status || 'active',
            unsettledCash: c.unsettledCash || 0,
            autoDisable: c.autoDisable !== false,
            graceDays: c.graceDays ?? 3,
            reminderDays: c.reminderDays || [7, 3, 1],
            createdAt: c.createdAt || new Date().toISOString(),
            note: c.note || null,
          });
        }
        this.logger.log(`Seeded: ${customers.length} billing_customers`);
      }
    }

    // Invoices
    const invoices: any[] = this.readJSON(path.join(billingDir, 'invoices.json'));
    if (invoices?.length) {
      const count = await this.invRepo.count();
      if (count === 0) {
        for (const i of invoices) {
          await this.invRepo.save({
            id: i.id,
            customerId: i.customerId,
            customerName: i.customerName,
            sessionId: i.sessionId,
            type: i.type || 'pppoe',
            mikrotikUser: i.mikrotikUser,
            profile: i.profile || '',
            amount: i.amount || 0,
            period: i.period,
            dueDate: i.dueDate,
            status: i.status || 'unpaid',
            paidAt: i.paidAt || null,
            paidBy: i.paidBy || null,
            note: i.note || null,
            createdAt: i.createdAt || new Date().toISOString(),
            reminderSent: i.reminderSent || [],
          });
        }
        this.logger.log(`Seeded: ${invoices.length} invoices`);
      }
    }

    // Settlements
    const settlements: any[] = this.readJSON(path.join(billingDir, 'settlements.json'));
    if (settlements?.length) {
      const count = await this.settleRepo.count();
      if (count === 0) {
        for (const s of settlements) {
          await this.settleRepo.save({
            id: s.id,
            collectorId: s.collectorId,
            collectorName: s.collectorName,
            sessionId: s.sessionId || '',
            amount: s.amount || 0,
            status: s.status || 'pending',
            createdAt: s.createdAt || new Date().toISOString(),
            verifiedAt: s.verifiedAt || null,
          });
        }
        this.logger.log(`Seeded: ${settlements.length} settlements`);
      }
    }
  }

  // ── 6. Voucher Types ───────────────────────────────────────────
  private async seedVoucherTypes() {
    const data = this.readJSON(path.join(DATA_DIR, 'voucher-types.json'));
    if (!data?.length) return;
    const count = await this.vtypeRepo.count();
    if (count > 0) return;
    for (const v of data) {
      await this.vtypeRepo.save({
        id: v.id,
        name: v.name,
        price: v.price || 0,
        profile: v.profile,
        duration: v.duration || '',
        codeLength: v.codeLength || 6,
        codeFormat: v.codeFormat || 'upper+digit',
        maxPerOrder: v.maxPerOrder || 10,
        userType: v.userType || 'up',
        active: v.active !== false,
        createdAt: v.createdAt || new Date().toISOString(),
      });
    }
    this.logger.log(`Seeded: ${data.length} voucher_types`);
  }

  // ── 7. Voucher Batches ─────────────────────────────────────────
  private async seedBatches() {
    const batchesDir = path.join(DATA_DIR, 'batches');
    if (!fs.existsSync(batchesDir)) return;
    const count = await this.batchRepo.count();
    if (count > 0) return;

    const files = fs.readdirSync(batchesDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const sessionId = file.replace('.json', '');
      const data = this.readJSON(path.join(batchesDir, file));
      if (!data?.length) continue;
      for (const b of data) {
        await this.batchRepo.save({
          id: b.id,
          sessionId: b.sessionId || sessionId,
          profileName: b.profileName,
          profileColor: b.profileColor || '#1f6feb',
          price: b.price || 0,
          totalPrice: b.totalPrice || 0,
          validity: b.validity || '',
          caption: b.caption || null,
          nasName: b.nasName || sessionId,
          createdBy: b.createdBy || 'seed',
          createdAt: b.createdAt || new Date().toISOString(),
          resellerId: b.resellerId || null,
          resellerName: b.resellerName || null,
          vouchers: b.vouchers || [],
        });
      }
      this.logger.log(`Seeded: ${data.length} batches from ${file}`);
    }
  }

  // ── 8. Bot Resellers ───────────────────────────────────────────
  private async seedBotResellers() {
    const data = this.readJSON(path.join(DATA_DIR, 'bot-resellers.json'));
    if (!data?.length) return;
    const count = await this.botRepo.count();
    if (count > 0) return;
    for (const r of data) {
      await this.botRepo.save({
        id: r.id,
        name: r.name,
        username: r.username || null,
        telegramId: r.telegramId,
        sessionId: r.sessionId || null,
        saldo: r.saldo || 0,
        totalVoucher: r.totalVoucher || 0,
        totalIncome: r.totalIncome || 0,
        status: r.status || 'active',
        markup: r.markup || 0,
        discount: r.discount || 0,
        createdAt: r.createdAt || new Date().toISOString(),
        lastActive: r.lastActive || null,
        note: r.note || null,
      });
    }
    this.logger.log(`Seeded: ${data.length} bot_resellers`);
  }

  // ── 9. Topup Logs ──────────────────────────────────────────────
  private async seedTopupLogs() {
    const data = this.readJSON(path.join(DATA_DIR, 'bot-topup-log.json'));
    if (!data?.length) return;
    const count = await this.topupLogRepo.count();
    if (count > 0) return;
    for (const l of data) {
      await this.topupLogRepo.save({
        reselerId: l.reselerId,
        amount: l.amount || 0,
        type: l.type || 'topup',
        note: l.note || '',
        by: l.by || 'system',
        at: l.at || new Date().toISOString(),
        balanceBefore: l.balanceBefore || 0,
        balanceAfter: l.balanceAfter || 0,
      });
    }
    this.logger.log(`Seeded: ${data.length} topup_logs`);
  }

  // ── 10. Mobile Tokens ──────────────────────────────────────────
  private async seedMobileTokens() {
    const data = this.readJSON(path.join(DATA_DIR, 'mobile-user-tokens.json'));
    if (!data?.length) return;
    const count = await this.tokenRepo.count();
    if (count > 0) return;
    let seeded = 0;
    for (const t of data) {
      // Skip entries missing required NOT NULL fields to avoid crashing the seed
      if (!t.token || !t.userId || !t.username || !t.name || !t.role) {
        this.logger.warn(
          `Skipping mobile token with missing required fields: ${JSON.stringify(t)}`
        );
        continue;
      }
      await this.tokenRepo.save({
        token: t.token,
        userId: t.userId,
        username: t.username,
        name: t.name,
        role: t.role,
        permissions: t.permissions || null,
        sessionId: t.sessionId || null,
        createdAt: t.createdAt || new Date().toISOString(),
        expiresAt: t.expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
        lastUsed: t.lastUsed || null,
      });
      seeded++;
    }
    this.logger.log(`Seeded: ${seeded} mobile_tokens`);
  }

  // ── 11. Telegram Config ────────────────────────────────────────
  private async seedTelegramConfig() {
    const data = this.readJSON(path.join(process.cwd(), 'telegram.json'));
    if (!data) return;
    const count = await this.tgRepo.count();
    if (count > 0) return;

    const configs = Array.isArray(data) ? data : [data];
    for (const c of configs) {
      await this.tgRepo.save({
        id: c.id || c.sessionId || 'default',
        token: c.token || '',
        chatId: c.chatId || '',
        sessionId: c.sessionId || '',
        notifSale: c.notifSale !== false,
        notifDaily: !!c.notifDaily,
        dailyTime: c.dailyTime || '23:59',
        botEnabled: c.botEnabled !== false,
        allowedUsers: c.allowedUsers || [],
        defaultProfile: c.defaultProfile || '',
        welcomeMsg: c.welcomeMsg || '',
      });
    }
    this.logger.log(`Seeded: ${configs.length} telegram_configs`);
  }

  // ── 12. Topup Requests ─────────────────────────────────────────
  private async seedTopupRequests() {
    const data = this.readJSON(path.join(DATA_DIR, 'topup-requests.json'));
    if (!data?.length) return;
    const count = await this.topupReqRepo.count();
    if (count > 0) return;
    for (const r of data) {
      await this.topupReqRepo.save({
        id: r.id,
        resellerId: r.resellerId,
        resellerName: r.resellerName,
        telegramId: r.telegramId,
        amount: r.amount || 0,
        note: r.note || '',
        requestedAt: r.requestedAt || new Date().toISOString(),
        status: r.status || 'pending',
      });
    }
    this.logger.log(`Seeded: ${data.length} topup_requests`);
  }

  // ── 14. Payment Config ─────────────────────────────────────────
  private async seedPaymentConfig() {
    const count = await this.payConfigRepo.count();
    if (count > 0) return;
    await this.payConfigRepo.save({
      key: 'default',
      defaultProvider: 'duitku',
      midtransEnabled: false,
      midtransEnv: 'sandbox',
      duitkuEnabled: false,
      duitkuEnv: 'sandbox',
      duitkuExpiryMinutes: 10,
payhookEnabled: false,
      payhookEnv: 'sandbox',
      payhookDefaultMethod: 'QRIS',
      payhookUniqueDigits: 3,
      payhookQrisExpiryMinutes: 15,
      payhookWaEnabled: false,
      payhookWalledGardenHosts: 'cdn.jsdelivr.net, voucher.sysbill.ink',
    });
    this.logger.log('Seeded: payment_config');
  }

  // ── 13. Profile Meta (hotspot + pppoe) ─────────────────────────
  private async seedProfileMeta() {
    const count = await this.metaRepo.count();
    if (count > 0) return;

    // hotspot profile-meta.json
    const hotspotMeta = this.readJSON(path.join(DATA_DIR, 'profile-meta.json'));
    if (hotspotMeta) {
      for (const [sessionId, profiles] of Object.entries(hotspotMeta) as [string, any][]) {
        for (const [profileName, meta] of Object.entries(profiles)) {
          const m = meta as any;
          await this.metaRepo.save({
            id: `hotspot:${sessionId}:${profileName}`,
            kind: 'hotspot',
            sessionId,
            profileName,
            price: m.price || 0,
            validity: m.validity || '',
            profileColor: m.profileColor || null,
            caption: m.caption || null,
            active: m.active !== false,
          });
        }
      }
      this.logger.log('Seeded: hotspot profile_meta');
    }

    // pppoe profile-meta.json
    const pppoeMeta = this.readJSON(path.join(DATA_DIR, 'pppoe-profile-meta.json'));
    if (pppoeMeta) {
      for (const [sessionId, profiles] of Object.entries(pppoeMeta) as [string, any][]) {
        for (const [profileName, meta] of Object.entries(profiles)) {
          const m = meta as any;
          await this.metaRepo.save({
            id: `pppoe:${sessionId}:${profileName}`,
            kind: 'pppoe',
            sessionId,
            profileName,
            price: 0,
            validity: '',
            active: m.active !== false,
          });
        }
      }
      this.logger.log('Seeded: pppoe profile_meta');
    }
  }
}

