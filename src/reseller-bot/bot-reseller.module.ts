import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotResellerController } from './bot-reseller.controller';
import { BotResellerService } from './bot-reseller.service';
import { BotResellerTelegramService } from './bot-reseller-telegram.service';
import { BotResellerEntity } from '../database/entities/bot-reseller.entity';
import { TopupLogEntity } from '../database/entities/topup-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BotResellerEntity, TopupLogEntity])],
  controllers: [BotResellerController],
  providers: [BotResellerService, BotResellerTelegramService],
  exports: [BotResellerService, BotResellerTelegramService],
})
export class BotResellerModule {}

