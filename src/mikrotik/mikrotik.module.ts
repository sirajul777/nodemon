import { Module } from '@nestjs/common';
import { MikrotikService } from './mikrotik.service';
import { MikrotikController } from './mikrotik.controller';
import { ProfileMetaService } from '../database/profile-meta.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileMetaEntity } from '../database/entities/profile-meta.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProfileMetaEntity])],
  providers: [MikrotikService, ProfileMetaService],
  controllers: [MikrotikController],
  exports: [MikrotikService, ProfileMetaService],
})
export class MikrotikModule {}
