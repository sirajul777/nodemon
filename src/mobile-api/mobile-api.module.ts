import { Module } from '@nestjs/common';
import { MobileApiController } from './mobile-api.controller';
import { BotResellerModule } from '../reseller-bot/bot-reseller.module';
import { BillingModule } from '../billing/billing.module';
import { MikrotikModule } from '../mikrotik/mikrotik.module';

@Module({
  imports: [BotResellerModule, BillingModule, MikrotikModule],
  controllers: [MobileApiController],
})
export class MobileApiModule {}