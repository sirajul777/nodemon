import { Module } from '@nestjs/common';
import { VoucherController } from './voucher.controller';
import { VoucherService } from './voucher.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { ResellerModule } from '../reseller/reseller.module';

@Module({
  imports: [MikrotikModule, ResellerModule],
  controllers: [VoucherController],
  providers: [VoucherService],
})
export class VoucherModule {}