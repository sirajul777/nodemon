import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';

@Module({
  imports: [MikrotikModule],
  controllers: [BillingController],
  providers: [BillingService, BillingSchedulerService],
  exports: [BillingService, BillingSchedulerService],
})
export class BillingModule {}