import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MobileApiController } from "./mobile-api.controller";
import { BotResellerModule } from "../reseller-bot/bot-reseller.module";
import { BillingModule } from "../billing/billing.module";
import { MikrotikModule } from "../mikrotik/mikrotik.module";
import { ConfigModule } from "../config/config.module";
import { MobileAuthService } from "./mobile-api.service";
import { MobileTokenService, MobileAuthGuard } from "./mobile-auth.guard";
import { MobileTokenEntity } from "../database/entities/mobile-token.entity";

@Module({
  imports: [
    BotResellerModule,
    BillingModule,
    MikrotikModule,
    ConfigModule,
    TypeOrmModule.forFeature([MobileTokenEntity])
  ],
  providers: [MobileAuthService, MobileTokenService, MobileAuthGuard],
  controllers: [MobileApiController],
  exports: [MobileAuthService, MobileTokenService]
})
export class MobileApiModule {}

