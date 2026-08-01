import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherBatchController } from './voucher-batch.controller';
import { VoucherBatchService } from './voucher-batch.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { VoucherBatchEntity } from '../database/entities/voucher-batch.entity';
import { ProfileMetaService } from '../database/profile-meta.service';
import { ProfileMetaEntity } from '../database/entities/profile-meta.entity';

@Module({
  imports: [
    MikrotikModule,
    TypeOrmModule.forFeature([VoucherBatchEntity, ProfileMetaEntity]),
  ],
  controllers: [VoucherBatchController],
  providers: [VoucherBatchService, ProfileMetaService],
  exports: [VoucherBatchService],
})
export class VoucherBatchModule {}

