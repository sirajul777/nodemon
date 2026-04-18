import { Module } from '@nestjs/common';
import { ResellerController } from './reseller.controller';
import { ResellerService } from './reseller.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';

@Module({
  imports: [MikrotikModule],
  controllers: [ResellerController],
  providers: [ResellerService],
  exports: [ResellerService],
})
export class ResellerModule {}