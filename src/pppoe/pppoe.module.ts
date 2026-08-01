import { Module } from '@nestjs/common';
import { PppoeController } from './pppoe.controller';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { ProfileMetaService } from '../database/profile-meta.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileMetaEntity } from '../database/entities/profile-meta.entity';

@Module({
  imports: [MikrotikModule, TypeOrmModule.forFeature([ProfileMetaEntity])],
  controllers: [PppoeController],
  providers: [ProfileMetaService],
})
export class PppoeModule {}
