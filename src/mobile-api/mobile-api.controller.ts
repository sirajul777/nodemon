import {
  Controller, Get, Post, Body, Param, Query,
  Headers, UseGuards, Req, HttpCode, BadRequestException,
} from '@nestjs/common';
import { MobileAuthGuard, MobileTokenService } from './mobile-auth.guard';
import { BotResellerService } from '../reseller-bot/bot-reseller.service';
import { BillingService } from '../billing/billing.service';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';

// ── Helper ────────────────────────────────────────────────────────────────────
const OK  = (data: any)   => ({ success: true, ...data });
const ERR = (msg: string) => ({ success: false, error: msg });

// ── Mobile API Controller ─────────────────────────────────────────────────────
@Controller('mobile/v1')
export class MobileApiController {
  constructor(
    private readonly resellerSvc: BotResellerService,
    private readonly billingSvc:  BillingService,
    private readonly mikrotikSvc: MikrotikService,
    private readonly configSvc:   ConfigService,
  ) {}

  private conn(sessionId: string) {
    const s = this.configSvc.getDecryptedSession(sessionId);
    if (!s) throw new BadRequestException('Session tidak ditemukan');
    return { ip: s.ip, user: s.user, password: s.password, port: s.port || 8728 };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTH — Login dengan Telegram ID atau token
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * POST /mobile/v1/auth/login
   * Body: { telegramId, pin? }
   * Reseller login — generate token baru
   */
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: { telegramId: string; pin?: string }) {
    if (!body.telegramId) return ERR('telegramId wajib diisi');
    const reseller = this.resellerSvc.getByTelegramId(body.telegramId);
    if (!reseller) return ERR('Akun reseller tidak ditemukan. Hubungi admin.');
    if (reseller.status !== 'active') return ERR('Akun reseller tidak aktif.');

    // Get default session from config
    const sessions = this.configSvc.getAllSessions ? this.configSvc.getAllSessions() : Object.values((this.configSvc as any).getSessions?.() || {});
    const session  = sessions[0];
    if (!session) return ERR('Router belum dikonfigurasi.');

    const token = MobileTokenService.generate(
      reseller.id, reseller.name, body.telegramId, session.id,
    );
    return OK({
      token: token.token,
      expiresAt: token.expiresAt,
      reseller: {
        id:        reseller.id,
        name:      reseller.name,
        username:  reseller.username,
        telegramId:reseller.telegramId,
        saldo:     reseller.saldo,
        discount:  reseller.discount,
        totalVoucher: reseller.totalVoucher,
        status:    reseller.status,
      },
    });
  }

  /**
   * POST /mobile/v1/auth/logout
   */
  @Post('auth/logout')
  @UseGuards(MobileAuthGuard)
  @HttpCode(200)
  logout(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    MobileTokenService.revoke(token);
    return OK({ message: 'Logout berhasil' });
  }

  /**
   * GET /mobile/v1/auth/me
   */
  @Get('auth/me')
  @UseGuards(MobileAuthGuard)
  me(@Req() req: any) {
    const mt = req.mobileToken;
    const reseller = this.resellerSvc.getById(mt.resellerId);
    if (!reseller) return ERR('Reseller tidak ditemukan');
    return OK({
      reseller: {
        id:           reseller.id,
        name:         reseller.name,
        username:     reseller.username,
        telegramId:   reseller.telegramId,
        saldo:        reseller.saldo,
        discount:     reseller.discount,
        markup:       reseller.markup,
        totalVoucher: reseller.totalVoucher,
        totalIncome:  reseller.totalIncome,
        status:       reseller.status,
      },
      session:   mt.sessionId,
      expiresAt: mt.expiresAt,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SALDO — Info & riwayat saldo
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /mobile/v1/saldo
   */
  @Get('saldo')
  @UseGuards(MobileAuthGuard)
  getSaldo(@Req() req: any) {
    const reseller = this.resellerSvc.getById(req.mobileToken.resellerId);
    if (!reseller) return ERR('Reseller tidak ditemukan');
    const logs = this.resellerSvc.loadLogs(reseller.id).slice(0, 50);
    return OK({
      saldo:        reseller.saldo,
      totalVoucher: reseller.totalVoucher,
      totalIncome:  reseller.totalIncome,
      logs: logs.map(l => ({
        type:          l.type,
        amount:        l.amount,
        note:          l.note,
        at:            l.at,
        balanceBefore: l.balanceBefore,
        balanceAfter:  l.balanceAfter,
      })),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // VOUCHER — List profile & generate
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /mobile/v1/voucher/profiles
   * Daftar profile dengan harga reseller
   */
  @Get('voucher/profiles')
  @UseGuards(MobileAuthGuard)
  async getProfiles(@Req() req: any) {
    const mt       = req.mobileToken;
    const reseller = this.resellerSvc.getById(mt.resellerId);
    if (!reseller) return ERR('Reseller tidak ditemukan');

    const conn   = this.conn(mt.sessionId);
    const client = await this.mikrotikSvc.createClient(conn.ip, conn.user, conn.password, conn.port);
    try {
      const profiles = await client.run('/ip/hotspot/user/profile/print');
      const result = profiles.map(p => {
        const ol = this.parseOnLogin(p['on-login'] || '');
        if (!ol.price && !ol.sprice) return null;
        const basePrice = ol.sprice || ol.price;
        const resellerPrice = reseller.discount > 0
          ? Math.round(basePrice * (1 - reseller.discount / 100))
          : basePrice;
        return {
          name:         p.name,
          rateLimit:    p['rate-limit'] || '',
          price:        basePrice,
          resellerPrice,
          discount:     reseller.discount,
          validity:     ol.validity,
          expmode:      ol.expmode,
          sharedUsers:  p['shared-users'] || '1',
        };
      }).filter(Boolean);
      return OK({ profiles: result });
    } finally { client.close(); }
  }

  /**
   * POST /mobile/v1/voucher/buy
   * Beli 1 voucher — potong saldo reseller
   * Body: { profileName }
   */
  @Post('voucher/buy')
  @UseGuards(MobileAuthGuard)
  @HttpCode(200)
  async buyVoucher(@Req() req: any, @Body() body: { profileName: string }) {
    const mt       = req.mobileToken;
    const reseller = this.resellerSvc.getById(mt.resellerId);
    if (!reseller) return ERR('Reseller tidak ditemukan');
    if (!body.profileName) return ERR('profileName wajib diisi');

    const conn   = this.conn(mt.sessionId);
    const client = await this.mikrotikSvc.createClient(conn.ip, conn.user, conn.password, conn.port);
    try {
      const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': body.profileName });
      if (!profiles[0]) return ERR(`Profile "${body.profileName}" tidak ditemukan`);
      const ol    = this.parseOnLogin(profiles[0]['on-login'] || '');
      const price = ol.sprice || ol.price || 0;
      const resellerPrice = reseller.discount > 0
        ? Math.round(price * (1 - reseller.discount / 100))
        : price;

      // Cek saldo
      if (reseller.saldo < resellerPrice) {
        return ERR(
          `Saldo tidak cukup. Saldo: Rp ${Math.round(reseller.saldo).toLocaleString('id-ID')}, ` +
          `Harga: Rp ${resellerPrice.toLocaleString('id-ID')}`
        );
      }

      // Generate username & password
      const uname = this.randomStr(5);
      const upass  = this.randomStr(5);
      const comment = `up-${Date.now()}-${new Date().toLocaleDateString('id-ID').replace(/\//g,'.').slice(0,8)}-${reseller.name.toUpperCase().replace(/\s+/g,'')}`;
      const params: Record<string, string> = {
        name: uname, password: upass, profile: body.profileName, comment,
      };
      if (ol.validity) params['limit-uptime'] = ol.validity;
      await client.run('/ip/hotspot/user/add', params);

      // Potong saldo
      this.resellerSvc.deductSaldo(reseller.telegramId, resellerPrice, `Beli ${body.profileName} (${uname})`);
      const updated = this.resellerSvc.getById(reseller.id);

      return OK({
        voucher: {
          username:    uname,
          password:    upass,
          profile:     body.profileName,
          validity:    ol.validity || '',
          rateLimit:   profiles[0]['rate-limit'] || '',
          price:       resellerPrice,
          comment,
        },
        saldoSebelum: reseller.saldo,
        saldoSesudah: updated?.saldo || 0,
      });
    } finally { client.close(); }
  }

  /**
   * POST /mobile/v1/voucher/generate
   * Generate batch voucher — potong saldo reseller
   * Body: { profileName, quantity }
   */
  @Post('voucher/generate')
  @UseGuards(MobileAuthGuard)
  @HttpCode(200)
  async generateVouchers(@Req() req: any, @Body() body: { profileName: string; quantity: number }) {
    const mt       = req.mobileToken;
    const reseller = this.resellerSvc.getById(mt.resellerId);
    if (!reseller) return ERR('Reseller tidak ditemukan');

    const qty = Math.min(Number(body.quantity) || 1, 100);
    if (!body.profileName) return ERR('profileName wajib diisi');

    const conn   = this.conn(mt.sessionId);
    const client = await this.mikrotikSvc.createClient(conn.ip, conn.user, conn.password, conn.port);
    try {
      const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': body.profileName });
      if (!profiles[0]) return ERR(`Profile tidak ditemukan`);
      const ol    = this.parseOnLogin(profiles[0]['on-login'] || '');
      const price = ol.sprice || ol.price || 0;
      const resellerPrice = reseller.discount > 0
        ? Math.round(price * (1 - reseller.discount / 100))
        : price;
      const totalCost = resellerPrice * qty;

      if (reseller.saldo < totalCost) {
        return ERR(
          `Saldo tidak cukup untuk ${qty} voucher. ` +
          `Dibutuhkan: Rp ${totalCost.toLocaleString('id-ID')}, ` +
          `Saldo: Rp ${Math.round(reseller.saldo).toLocaleString('id-ID')}`
        );
      }

      // Generate
      const existing = await client.run('/ip/hotspot/user/print');
      const existingNames = new Set(existing.map((u: any) => u.name));
      const vouchers: any[] = [];
      const tag = reseller.name.toUpperCase().replace(/\s+/g,'');
      const dateTag = new Date().toLocaleDateString('id-ID').replace(/\//g,'.').slice(0,8);
      let attempts = 0;

      while (vouchers.length < qty && attempts < qty * 10) {
        attempts++;
        const uname = this.randomStr(5);
        if (existingNames.has(uname)) continue;
        const upass = this.randomStr(5);
        existingNames.add(uname);
        const comment = `up-${Date.now()}-${dateTag}-${tag}`;
        const params: Record<string, string> = {
          name: uname, password: upass, profile: body.profileName, comment,
        };
        if (ol.validity) params['limit-uptime'] = ol.validity;
        try {
          await client.run('/ip/hotspot/user/add', params);
          vouchers.push({ username: uname, password: upass, profile: body.profileName, validity: ol.validity || '', comment });
        } catch {}
      }

      // Potong saldo
      const actualCost = resellerPrice * vouchers.length;
      this.resellerSvc.deductSaldo(
        reseller.telegramId, actualCost,
        `Generate ${vouchers.length}x ${body.profileName}`,
      );
      const updated = this.resellerSvc.getById(reseller.id);

      return OK({
        vouchers,
        generated:   vouchers.length,
        priceEach:   resellerPrice,
        totalCost:   actualCost,
        saldoSebelum: reseller.saldo,
        saldoSesudah: updated?.saldo || 0,
      });
    } finally { client.close(); }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // BILLING — Tagihan pelanggan
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /mobile/v1/billing/customers
   * Daftar pelanggan reseller ini (filter by telegramId)
   */
  @Get('billing/customers')
  @UseGuards(MobileAuthGuard)
  getBillingCustomers(@Req() req: any) {
    const mt = req.mobileToken;
    // All customers for this session
    const customers = this.billingSvc.loadCustomers(mt.sessionId);
    return OK({ customers: customers.map(c => ({
      id:          c.id,
      name:        c.name,
      phone:       c.phone,
      type:        c.type,
      profile:     c.profile,
      price:       c.price,
      billDate:    c.billDate,
      status:      c.status,
      mikrotikUser:c.mikrotikUser,
    }))});
  }

  /**
   * GET /mobile/v1/billing/invoices
   * Daftar tagihan (semua atau per pelanggan)
   */
  @Get('billing/invoices')
  @UseGuards(MobileAuthGuard)
  getBillingInvoices(
    @Req() req: any,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    const mt = req.mobileToken;
    let invs = this.billingSvc.loadInvoices(mt.sessionId, customerId);
    if (status) invs = invs.filter(i => i.status === status);
    return OK({
      invoices: invs.slice(0, 100).map(i => ({
        id:           i.id,
        customerId:   i.customerId,
        customerName: i.customerName,
        type:         i.type,
        period:       i.period,
        amount:       i.amount,
        dueDate:      i.dueDate,
        status:       i.status,
        paidAt:       i.paidAt || null,
        daysLeft:     this.billingSvc.getDaysUntilDue(i.dueDate),
      })),
    });
  }

  /**
   * POST /mobile/v1/billing/invoices/:id/pay
   * Tandai lunas
   */
  @Post('billing/invoices/:id/pay')
  @UseGuards(MobileAuthGuard)
  @HttpCode(200)
  payInvoice(@Req() req: any, @Param('id') id: string, @Body() body: { note?: string }) {
    const mt  = req.mobileToken;
    const inv = this.billingSvc.payInvoice(id, mt.resellerName, body.note);
    return inv ? OK({ invoice: inv }) : ERR('Invoice tidak ditemukan');
  }

  /**
   * GET /mobile/v1/billing/summary
   * Ringkasan billing bulan ini
   */
  @Get('billing/summary')
  @UseGuards(MobileAuthGuard)
  getBillingSummary(@Req() req: any) {
    const mt    = req.mobileToken;
    const stats = this.billingSvc.getStats(mt.sessionId);
    return OK({ stats });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DASHBOARD — Ringkasan untuk home screen mobile
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /mobile/v1/dashboard
   */
  @Get('dashboard')
  @UseGuards(MobileAuthGuard)
  async getDashboard(@Req() req: any) {
    const mt       = req.mobileToken;
    const reseller = this.resellerSvc.getById(mt.resellerId);
    if (!reseller) return ERR('Reseller tidak ditemukan');

    const billStats  = this.billingSvc.getStats(mt.sessionId);
    const recentLogs = this.resellerSvc.loadLogs(reseller.id).slice(0, 5);

    return OK({
      reseller: {
        name:         reseller.name,
        saldo:        reseller.saldo,
        totalVoucher: reseller.totalVoucher,
        totalIncome:  reseller.totalIncome,
        discount:     reseller.discount,
      },
      billing: {
        totalCustomers: billStats.total,
        active:         billStats.active,
        unpaidCount:    billStats.unpaidCount,
        unpaidAmount:   billStats.unpaidAmount,
        paidThisMonth:  billStats.paidThisMonth,
        incomeThisMonth:billStats.incomeThisMonth,
      },
      recentActivity: recentLogs.map(l => ({
        type:   l.type,
        amount: l.amount,
        note:   l.note,
        at:     l.at,
      })),
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private parseOnLogin(onLogin: string) {
    const empty = { expmode: '', price: 0, validity: '', sprice: 0 };
    if (!onLogin) return empty;
    const match = onLogin.match(/:put \("([^"]*)"\)/);
    if (!match) return empty;
    const p = match[1].split(',');
    return {
      expmode:  (p[1] || '').trim(),
      price:    parseFloat(p[2]) || 0,
      validity: (p[3] || '').trim(),
      sprice:   parseFloat(p[4]) || 0,
    };
  }

  private randomStr(len: number): string {
    const chars = 'abcdefghjkmnprstuvwxyz23456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}