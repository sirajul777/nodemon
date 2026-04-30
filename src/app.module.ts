import { Module, OnModuleInit } from "@nestjs/common";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";
import { MikrotikModule } from "./mikrotik/mikrotik.module";
import { ReportModule } from "./report/report.module";
import { SessionModule } from "./session/session.module";
import { ConfigModule } from "./config/config.module";
import { ResellerModule } from "./reseller/reseller.module";
import { VoucherModule } from "./voucher/voucher.module";
import { PppoeModule } from "./pppoe/pppoe.module";
import { VoucherBatchModule } from "./voucher-batch/voucher-batch.module";
import { VoucherTypeModule } from "./voucher-types/voucher-type.module";
import { TelegramModule } from "./telegram/telegram.module";
import { BotResellerModule } from "./reseller-bot/bot-reseller.module";
import { BillingModule } from "./billing/billing.module";
import { MobileApiModule } from "./mobile-api/mobile-api.module";
import { UserModule } from "./user-management/user.module";
import { AuthService } from "./auth/auth.service";
import { UserService } from "./user-management/user.service";
import { AppController } from "./app.controller";

@Module({
  imports: [
    // ServeStaticModule.forRoot({
    //   rootPath: join(__dirname, "..", "public"),
    //   exclude: ["/api*"]
    // }),
    ConfigModule,
    AuthModule,
    SessionModule,
    MikrotikModule,
    ReportModule,
    ResellerModule,
    VoucherModule,
    TelegramModule,
    PppoeModule,
    VoucherBatchModule,
    VoucherTypeModule,
    BotResellerModule,
    BillingModule,
    MobileApiModule,
    UserModule
  ],
  controllers: [AppController]
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService
  ) {}

  onModuleInit() {
    // Wire UserService into AuthService (avoid circular dependency)
    this.authService.setUserService(this.userService);
  }
}
