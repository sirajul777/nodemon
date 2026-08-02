import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { DatabaseSeedService } from './seed.service';
import { AppConfigEntity } from './entities/config.entity';
import { RouterSessionEntity } from './entities/router-session.entity';
import { UserEntity } from './entities/user.entity';
import { ResellerEntity } from './entities/reseller.entity';
import { BillingCustomerEntity } from './entities/billing-customer.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { SettlementEntity } from './entities/settlement.entity';
import { VoucherBatchEntity } from './entities/voucher-batch.entity';
import { VoucherTypeEntity } from './entities/voucher-type.entity';
import { BotResellerEntity } from './entities/bot-reseller.entity';
import { TopupLogEntity } from './entities/topup-log.entity';
import { MobileTokenEntity } from './entities/mobile-token.entity';
import { TelegramConfigEntity } from './entities/telegram-config.entity';
import { TopupRequestEntity } from './entities/topup-request.entity';
import { ProfileMetaEntity } from './entities/profile-meta.entity';
import { PaymentConfigEntity } from '../payment/payment-config.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        // Default: SQLite at data/mikhmon.db
        // Override with DATABASE_URL env for PostgreSQL
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl && dbUrl.startsWith('postgres')) {
          return {
            type: 'postgres',
            url: dbUrl,
            autoLoadEntities: true,
            synchronize: true,
            ssl: dbUrl.includes('sslmode=require')
              ? { rejectUnauthorized: false }
              : false,
          };
        }
        return {
          type: 'better-sqlite3',
          database: join(process.cwd(), 'data', 'mikhmon.db'),
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
    TypeOrmModule.forFeature([
      AppConfigEntity,
      RouterSessionEntity,
      UserEntity,
      ResellerEntity,
      BillingCustomerEntity,
      InvoiceEntity,
      SettlementEntity,
      VoucherBatchEntity,
      VoucherTypeEntity,
      BotResellerEntity,
      TopupLogEntity,
      MobileTokenEntity,
      TelegramConfigEntity,
      TopupRequestEntity,
      ProfileMetaEntity,
      PaymentConfigEntity,
    ]),
  ],
  providers: [DatabaseSeedService],
  exports: [TypeOrmModule, DatabaseSeedService],
})
export class DatabaseModule {}

