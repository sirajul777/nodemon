import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherTypeController } from './voucher-type.controller';
import { VoucherTypeService } from './voucher-type.service';
import { VoucherTypeEntity } from '../database/entities/voucher-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherTypeEntity])],
  controllers: [VoucherTypeController],
  providers: [VoucherTypeService],
  exports: [VoucherTypeService],
})
export class VoucherTypeModule {}

