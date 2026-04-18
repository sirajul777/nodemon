import { Controller, Get, Post, Body, UseGuards, OnModuleInit } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';
import { VoucherTypeService } from '../voucher-types/voucher-type.service';
import { BotResellerService } from '../reseller-bot/bot-reseller.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/telegram')
export class TelegramController implements OnModuleInit {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly mikrotikService: MikrotikService,
    private readonly configService: ConfigService,
    private readonly vtService: VoucherTypeService,
    private readonly resellerSvc: BotResellerService,
  ) {}

  onModuleInit() {
    this.telegramService.setServices(
      this.mikrotikService,
      this.configService,
      this.vtService,
      this.resellerSvc,
    );
  }

  @Get('config')
  @UseGuards(AuthGuard)
  getConfig() {
    const cfg = this.telegramService.getConfig();
    if (!cfg) return {};
    return { ...cfg, token: cfg.token ? cfg.token.slice(0, 8) + '...' : '' };
  }

  @Post('config')
  @UseGuards(AuthGuard)
  saveConfig(@Body() body: any) {
    this.telegramService.saveConfig({
      token:          body.token,
      chatId:         body.chatId,
      sessionId:      body.sessionId,
      notifSale:      !!body.notifSale,
      notifDaily:     !!body.notifDaily,
      dailyTime:      body.dailyTime || '23:59',
      botEnabled:     body.botEnabled !== false,
      allowedUsers:   Array.isArray(body.allowedUsers) ? body.allowedUsers : (body.allowedUsers ? [body.allowedUsers] : []),
      defaultProfile: body.defaultProfile || '',
      welcomeMsg:     body.welcomeMsg || '',
    });
    return { success: true };
  }

  @Get('logs')
  @UseGuards(AuthGuard)
  getLogs(): any { return this.telegramService.getLogs(); }

  @Post('test')
  @UseGuards(AuthGuard)
  async test(@Body() body: { token: string; chatId: string; sessionId: string }) {
    return this.telegramService.sendTest(body.token, body.chatId, body.sessionId);
  }
}