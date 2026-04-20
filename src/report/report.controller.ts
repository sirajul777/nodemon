import { Controller, Get, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/report')
@UseGuards(AuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get(':session/selling')
  getSelling(
    @Param('session') session: string,
    @Query('idhr') idhr?: string,
    @Query('idbl') idbl?: string,
    @Query('prefix') prefix?: string,
    @Query('datacomments') datacomments?: string,
    @Query('dataprofile') dataprofile?: string,
    @Query('reseller') reseller?: string,
  ) {
    return this.reportService.getSelling(session, { idhr, idbl, prefix, datacomments, dataprofile, reseller });
  }

  @Get(':session/live')
  getLive(@Param('session') session: string) {
    return this.reportService.getLiveReport(session);
  }

  @Get(':session/resume')
  getResume(@Param('session') session: string, @Query('idbl') idbl: string) {
    if (!idbl) return { error: 'idbl required' };
    return this.reportService.getResumeReport(session, idbl);
  }

  @Delete(':session/selling')
  deleteReport(
    @Param('session') session: string,
    @Query('idhr') idhr?: string,
    @Query('idbl') idbl?: string,
  ) {
    return this.reportService.deleteReportData(session, { idhr, idbl });
  }
}