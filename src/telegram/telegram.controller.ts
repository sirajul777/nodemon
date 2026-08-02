import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  OnModuleInit,
  Param,
  Delete
} from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { MikrotikService } from "../mikrotik/mikrotik.service";
import { ConfigService } from "../config/config.service";
import { VoucherTypeService } from "../voucher-types/voucher-type.service";
import { BotResellerService } from "../reseller-bot/bot-reseller.service";
import { AuthGuard } from "../auth/auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/permissions.decorator";

@Controller("api/telegram")
@UseGuards(PermissionsGuard)
@RequirePermission("manageSystem")
export class TelegramController implements OnModuleInit {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly mikrotikService: MikrotikService,
    private readonly configService: ConfigService,
    private readonly vtService: VoucherTypeService,
    private readonly resellerSvc: BotResellerService
  ) {}

  onModuleInit() {
    this.telegramService.setServices(
      this.mikrotikService,
      this.configService,
      this.vtService,
      this.resellerSvc
    );
  }

  @Get("config")
  @UseGuards(AuthGuard)
  getAllConfigs() {
    return this.telegramService.getAllConfigs().map((c) => ({
      ...c,
      token: c.token ? "***" : ""
    }));
  }

  @Get("config/:id")
  @UseGuards(AuthGuard)
  getConfig(@Param("id") id: string) {
    const cfg = this.telegramService.getConfig(id);
    if (!cfg) return {};
    return { ...cfg, token: cfg.token ? cfg.token : "" };
  }

  @Post("config")
  @UseGuards(AuthGuard)
  saveConfig(@Body() body: any) {
    const existing = this.telegramService.getConfig(body.id || body.sessionId);
    const token = body.token || existing?.token || "";
    this.telegramService.saveConfig({
      id: body.id || body.sessionId,
      token: token,
      chatId: body.chatId,
      sessionId: body.sessionId,
      notifSale: !!body.notifSale,
      notifDaily: !!body.notifDaily,
      dailyTime: body.dailyTime || "23:59",
      botEnabled: body.botEnabled !== false,
      allowedUsers: Array.isArray(body.allowedUsers)
        ? body.allowedUsers
        : body.allowedUsers
          ? [body.allowedUsers]
          : [],
      defaultProfile: body.defaultProfile || "",
      welcomeMsg: body.welcomeMsg || ""
    });
    return { success: true };
  }

  // DELETE — hapus config bot
  @Delete("config/:id")
  @UseGuards(AuthGuard)
  deleteConfig(@Param("id") id: string) {
    this.telegramService.deleteConfig(id);
    return { success: true };
  }

  @Get("status")
  @UseGuards(AuthGuard)
  getStatus() {
    return this.telegramService.getAllConfigs().map((cfg) => ({
      id: cfg.id,
      sessionId: cfg.sessionId,
      botEnabled: cfg.botEnabled,
      hasToken: !!cfg.token,
      chatId: cfg.chatId
    }));
  }

  @Get("logs")
  @UseGuards(AuthGuard)
  getLogs(): any {
    return this.telegramService.getLogs();
  }

  @Post("test")
  @UseGuards(AuthGuard)
  async test(
    @Body() body: { token: string; chatId: string; sessionId: string }
  ) {
    return this.telegramService.sendTest(
      body.token,
      body.chatId,
      body.sessionId
    );
  }
}
