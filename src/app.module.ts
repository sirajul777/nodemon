import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { MikrotikModule } from './mikrotik/mikrotik.module';
import { ReportModule } from './report/report.module';
import { SessionModule } from './session/session.module';
import { ConfigModule } from './config/config.module';
import { ResellerModule } from './reseller/reseller.module';
import { VoucherModule } from './voucher/voucher.module';
import { PppoeModule } from './pppoe/pppoe.module';
import { VoucherBatchModule } from './voucher-batch/voucher-batch.module';
import { VoucherTypeModule } from './voucher-types/voucher-type.module';
import { TelegramModule } from './telegram/telegram.module';
import { BotResellerModule } from './reseller-bot/bot-reseller.module';
import { BillingModule } from './billing/billing.module';
import { MobileApiModule } from './mobile-api/mobile-api.module';



@Module({
  imports: [
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public') }),
    ConfigModule, AuthModule, SessionModule, MikrotikModule,
    ReportModule, ResellerModule, VoucherModule,TelegramModule,
    PppoeModule, VoucherBatchModule,VoucherTypeModule,BotResellerModule,BillingModule,MobileApiModule
  ],
})
export class AppModule {}