import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Req,
  HttpCode,
  BadRequestException
} from "@nestjs/common";
import { MobileAuthGuard, MobileTokenService } from "./mobile-auth.guard";
import { BotResellerService } from "../reseller-bot/bot-reseller.service";
import { BillingService } from "../billing/billing.service";
import { ConfigService } from "../config/config.service";
import { MobileAuthService } from "./mobile-api.service";

const OK = (data: any) => ({ success: true, data });
const ERR = (msg: string) => ({ success: false, error: msg });

@Controller("mobile/v1")
export class MobileApiController {
  constructor(
    private readonly resellerSvc: BotResellerService,
    private readonly billingSvc: BillingService,
    private readonly configSvc: ConfigService,
    private readonly authSvc: MobileAuthService
  ) {}

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTH - Login Khusus Collector / Reseller
  // ══════════════════════════════════════════════════════════════════════════════

  @Post("auth/login")
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }) {
    if (!body.username || !body.password)
      return ERR("Username dan password wajib diisi");

    const result = await this.authSvc.validateUserFull(
      body.username,
      body.password
    );
    if (!result) return ERR("Username atau password salah");

    // Validasi Role: Hanya Collector atau Admin yang bisa menagih
    if (!["collector", "admin", "reseller"].includes(result.role)) {
      return ERR("Akun Anda tidak memiliki akses sebagai petugas lapangan");
    }

    const token = MobileTokenService.generate(
      result.id,
      result.username,
      result.name,
      result.role,
      result.permissions,
      result.allowedSessions[0]
    );

    return {
      success: true,
      token: token.token,
      user: {
        id: result.id,
        name: result.name,
        role: result.role
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CUSTOMERS - Daftar Pelanggan untuk Ditagih
  // ══════════════════════════════════════════════════════════════════════════════

  @Get("billing/customers")
  @UseGuards(MobileAuthGuard)
  async getCustomers(@Req() req: any) {
    // Ambil semua customer dari semua session yang diizinkan untuk user ini
    // (Atau filter berdasarkan session tertentu jika diperlukan)
    const customers = this.billingSvc.loadCustomers();

    return OK(
      customers.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        phone: c.phone,
        profile: c.profile,
        price: c.price,
        status: c.status // active/expired
      }))
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // INVOICES - Penagihan di Lapangan
  // ══════════════════════════════════════════════════════════════════════════════

  @Get("billing/invoices/unpaid")
  @UseGuards(MobileAuthGuard)
  getUnpaidInvoices() {
    const invoices = this.billingSvc
      .loadInvoices()
      .filter((i) => i.status === "unpaid");
    return OK(invoices);
  }

  @Post("billing/invoices/:id/pay")
  @UseGuards(MobileAuthGuard)
  @HttpCode(200)
  async processPayment(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { note?: string; paymentMethod?: string }
  ) {
    const collectorName = req.user.name;
    const inv = this.billingSvc.payInvoice(
      id,
      collectorName,
      body.note || "Bayar di tempat"
    );

    if (!inv)
      return ERR("Gagal memproses pembayaran. Invoice mungkin sudah lunas.");

    return OK({
      message: "Pembayaran berhasil dicatat",
      invoice: inv
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SETTLEMENT - Laporan Setoran Uang dari Collector ke Admin
  // ══════════════════════════════════════════════════════════════════════════════

  @Get("settlement/summary")
  @UseGuards(MobileAuthGuard)
  getSettlementSummary(@Req() req: any) {
    const collectorId = req.user.id;

    // Hitung total uang tunai yang dibawa collector tapi belum disetor ke admin
    const unsetteled = this.billingSvc.getUnsettledAmount(collectorId);
    const history = this.billingSvc.getSettlementHistory(collectorId);

    return OK({
      unsetteled,
      history: history.slice(0, 10) // 10 riwayat setoran terakhir
    });
  }

  @Post("settlement/submit")
  @UseGuards(MobileAuthGuard)
  @HttpCode(200)
  async submitSettlement(@Req() req: any, @Body() body: { amount: number }) {
    const result = this.billingSvc.createSettlementReport({
      collectorId: req.user.id,
      collectorName: req.user.name,
      amount: body.amount,
      date: new Date().toISOString()
    });

    return result
      ? OK({ message: "Laporan setoran berhasil dikirim" })
      : ERR("Gagal membuat laporan");
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DASHBOARD - Ringkasan Tugas Collector
  // ══════════════════════════════════════════════════════════════════════════════

  @Get("dashboard")
  @UseGuards(MobileAuthGuard)
  async getDashboard(@Req() req: any) {
    const unpaidStats = this.billingSvc.getUnpaidStats();
    const myCash = this.billingSvc.getUnsettledAmount(req.user.id);

    return OK({
      user: {
        name: req.user.name,
        role: req.user.role
      },
      stats: {
        totalUnpaidCount: unpaidStats.count,
        totalUnpaidAmount: unpaidStats.total,
        cashInHand: myCash // Uang yang dibawa tukang tagih
      }
    });
  }
}
