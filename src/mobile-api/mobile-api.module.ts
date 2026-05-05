import { Module } from "@nestjs/common";
import { MobileApiController } from "./mobile-api.controller";
import { BotResellerModule } from "../reseller-bot/bot-reseller.module";
import { BillingModule } from "../billing/billing.module";
import { MikrotikModule } from "../mikrotik/mikrotik.module";
import { ConfigModule } from "../config/config.module";
import { MobileAuthService } from "./mobile-api.service";

@Module({
  imports: [BotResellerModule, BillingModule, MikrotikModule, ConfigModule],
  providers: [MobileAuthService],
  controllers: [MobileApiController]
})
export class MobileApiModule {}
