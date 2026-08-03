import { AppConfigEntity } from './config.entity';
import { RouterSessionEntity } from './router-session.entity';
import { UserEntity } from './user.entity';
import { ResellerEntity } from './reseller.entity';
import { BillingCustomerEntity } from './billing-customer.entity';
import { InvoiceEntity } from './invoice.entity';
import { SettlementEntity } from './settlement.entity';
import { VoucherBatchEntity } from './voucher-batch.entity';
import { VoucherTypeEntity } from './voucher-type.entity';
import { BotResellerEntity } from './bot-reseller.entity';
import { TopupLogEntity } from './topup-log.entity';
import { MobileTokenEntity } from './mobile-token.entity';
import { TelegramConfigEntity } from './telegram-config.entity';
import { TopupRequestEntity } from './topup-request.entity';
import { ProfileMetaEntity } from './profile-meta.entity';
import { PaymentConfigEntity } from '../../payment/payment-config.entity';
import { VoucherOrderEntity } from '../../payment/payhook/entities/voucher-order.entity';
import { PayhookCallbackLogEntity } from '../../payment/payhook/entities/payhook-callback-log.entity';

export const entities = [
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
  VoucherOrderEntity,
  PayhookCallbackLogEntity,
];

export {
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
};

