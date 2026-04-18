import { Module } from '@nestjs/common';
import { VoucherBatchController } from './voucher-batch.controller';
import { VoucherBatchService } from './voucher-batch.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';

@Module({
  imports: [MikrotikModule],
  controllers: [VoucherBatchController],
  providers: [VoucherBatchService],
  exports: [VoucherBatchService],
})
export class VoucherBatchModule {}