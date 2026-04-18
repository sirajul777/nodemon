import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { VoucherTypeModule } from '../voucher-types/voucher-type.module';
import { BotResellerModule } from '../reseller-bot/bot-reseller.module';

@Module({
  imports: [MikrotikModule, VoucherTypeModule, BotResellerModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}