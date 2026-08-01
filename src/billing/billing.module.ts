import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { BillingCustomerEntity } from '../database/entities/billing-customer.entity';
import { InvoiceEntity } from '../database/entities/invoice.entity';
import { SettlementEntity } from '../database/entities/settlement.entity';

@Module({
  imports: [
    MikrotikModule,
    TypeOrmModule.forFeature([
      BillingCustomerEntity,
      InvoiceEntity,
      SettlementEntity
    ])
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingSchedulerService],
  exports: [BillingService, BillingSchedulerService],
})
export class BillingModule {}

