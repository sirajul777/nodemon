import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { ResellerModule } from '../reseller/reseller.module';

@Module({
  imports: [MikrotikModule, ResellerModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}