import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentConfigModule } from './payment-config.module';
import { MidtransModule } from './midtrans/midtrans.module';
import { DuitkuModule } from './duitku/duitku.module';
import { PaymentConfigService } from './payment-config.service';
import { PaymentService } from './payment.service';
import { PaymentStatusListener } from './payment-status.listener';
import { PaymentController } from './payment.controller';
import { PaymentTransaction as MidtransPaymentTransaction } from './midtrans/entities/payment-transaction.entity';
import { PaymentTransaction as DuitkuPaymentTransaction } from './duitku/entities/payment-transaction.entity';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PaymentConfigModule,
    BillingModule,
    TypeOrmModule.forFeature([
      MidtransPaymentTransaction,
      DuitkuPaymentTransaction,
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
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentStatusListener],
  exports: [PaymentService, PaymentStatusListener],
})
export class PaymentModule {}

