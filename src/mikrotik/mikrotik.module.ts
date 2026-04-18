import { Module } from '@nestjs/common';
import { MikrotikService } from './mikrotik.service';
import { MikrotikController } from './mikrotik.controller';

@Module({
  providers: [MikrotikService],
  controllers: [MikrotikController],
  exports: [MikrotikService],
})
export class MikrotikModule {}
