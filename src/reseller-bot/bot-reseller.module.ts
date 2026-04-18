import { Module } from '@nestjs/common';
import { BotResellerController } from './bot-reseller.controller';
import { BotResellerService } from './bot-reseller.service';
import { BotResellerTelegramService } from './bot-reseller-telegram.service';

@Module({
  controllers: [BotResellerController],
  providers: [BotResellerService, BotResellerTelegramService],
  exports: [BotResellerService, BotResellerTelegramService],
})
export class BotResellerModule {}