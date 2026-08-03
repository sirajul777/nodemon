import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VoucherOrderEntity } from './entities/voucher-order.entity';
import { PayhookCallbackLogEntity } from './entities/payhook-callback-log.entity';
import { VoucherOrderService } from './voucher-order.service';
import { VoucherOrderController } from './voucher-order.controller';
import { QrisService } from './qris.service';
import { MikrotikModule } from '../../mikrotik/mikrotik.module';
import { VoucherTypeModule } from '../../voucher-types/voucher-type.module';
import { TelegramModule } from '../../telegram/telegram.module';
import { PaymentConfigModule } from '../payment-config.module';

/**
 * PayHook module — QRIS GoPay Merchant (PayHook Android app) voucher-selling
 * flow. No external payment gateway API is called; the PayHook Android app
 * reads GoPay Merchant notifications and forwards a webhook with the amount.
 *
 * Endpoints exposed by VoucherOrderController:
 *   POST /payments/payhook/app-webhook  ← PayHook Android app webhook receiver
 *   POST /api/qris/orders               ← create an order (checkout frontend)
 *   GET  /qris/checkout/:orderId        ← customer-facing QRIS checkout page
 *   GET  /qris/status/:orderId          ← polling status for the checkout page
 *   GET  /api/qris/orders               ← order list (admin)
 *   GET  /api/qris/orders/:id           ← order detail (admin)
 *   POST /api/qris/orders/:id/verify    ← manual fallback verification (admin)
 *   GET  /api/qris/callbacks            ← PayHook callback monitor log (admin)
 *   GET  /api/qris/stats                ← summary stats (admin)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([VoucherOrderEntity, PayhookCallbackLogEntity]),
    MikrotikModule,
    VoucherTypeModule,
    TelegramModule,
    PaymentConfigModule
  ],
  controllers: [VoucherOrderController],
  providers: [VoucherOrderService, QrisService],
  exports: [VoucherOrderService, QrisService]
})
export class PayhookModule {}

