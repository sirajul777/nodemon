import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentConfigModule } from './payment-config.module';
import { MidtransModule } from './midtrans/midtrans.module';
import { DuitkuModule } from './duitku/duitku.module';
import { PayhookModule } from './payhook/payhook.module';
import { PaymentConfigService } from './payment-config.service';
import { PaymentService } from './payment.service';
import { PaymentStatusListener } from './payment-status.listener';
import { PaymentController } from './payment.controller';
import { PaymentTransaction as MidtransPaymentTransaction } from './midtrans/entities/payment-transaction.entity';
import { PaymentTransaction as DuitkuPaymentTransaction } from './duitku/entities/payment-transaction.entity';
import { PaymentTransaction as PayhookPaymentTransaction } from './payhook/entities/payment-transaction.entity';
import { BillingModule } from '../billing/billing.module';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { VoucherTypeModule } from '../voucher-types/voucher-type.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PaymentConfigModule,
    BillingModule,
    MikrotikModule,
    VoucherTypeModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      MidtransPaymentTransaction,
      DuitkuPaymentTransaction,
      PayhookPaymentTransaction,
    ]),
    /**
     * Wire both gateway modules using the DB-backed config (no env vars).
     * The MidtransDuitkuConfigService reads the singleton config row.
     */
    MidtransModule.forRootAsync({
      imports: [PaymentConfigModule],
      inject: [PaymentConfigService],
      useFactory: async (config: PaymentConfigService) =>
        config.getMidtransOptions(),
    }),
    DuitkuModule.forRootAsync({
      imports: [PaymentConfigModule],
      inject: [PaymentConfigService],
      useFactory: async (config: PaymentConfigService) =>
        config.getDuitkuOptions(),
    }),
    PayhookModule.forRootAsync({
      imports: [PaymentConfigModule],
      inject: [PaymentConfigService],
      useFactory: async (config: PaymentConfigService) =>
        config.getPayhookOptions(),
    }),
  ],
controllers: [PaymentController],
  providers: [PaymentService, PaymentStatusListener],
  exports: [PaymentService, PaymentStatusListener],
})
export class PaymentModule {}

