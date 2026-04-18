import { Module } from '@nestjs/common';
import { VoucherTypeController } from './voucher-type.controller';
import { VoucherTypeService } from './voucher-type.service';

@Module({
  controllers: [VoucherTypeController],
  providers: [VoucherTypeService],
  exports: [VoucherTypeService],
})
export class VoucherTypeModule {}