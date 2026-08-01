import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResellerController } from './reseller.controller';
import { ResellerService } from './reseller.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { ResellerEntity } from '../database/entities/reseller.entity';

@Module({
  imports: [MikrotikModule, TypeOrmModule.forFeature([ResellerEntity])],
  controllers: [ResellerController],
  providers: [ResellerService],
  exports: [ResellerService],
})
export class ResellerModule {}

