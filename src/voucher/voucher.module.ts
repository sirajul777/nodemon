import { Module } from '@nestjs/common';
import { VoucherController } from './voucher.controller';
import { VoucherService } from './voucher.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { ResellerModule } from '../reseller/reseller.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [MikrotikModule, ResellerModule, DatabaseModule],
  controllers: [VoucherController],
  providers: [VoucherService],
})
export class VoucherModule {}

