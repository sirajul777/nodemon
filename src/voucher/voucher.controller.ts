import { Controller, Get, Post, Body, Param, UseGuards, Res } from '@nestjs/common';
import { VoucherService, VoucherBatchRequest } from './voucher.service';
import { AuthGuard } from '../auth/auth.guard';
import { Response } from 'express';

@Controller('api/voucher')
@UseGuards(AuthGuard)
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Get(':session/profiles')
  getProfiles(@Param('session') session: string) {
    return this.voucherService.getProfiles(session);
  }

  @Post('generate')
  async generate(@Body() body: VoucherBatchRequest) {
    const vouchers = await this.voucherService.generateBatch(body);
    return { success: true, count: vouchers.length, vouchers };
  }

  @Post('generate/csv')
  async generateCsv(@Body() body: VoucherBatchRequest, @Res() res: Response) {
    const vouchers = await this.voucherService.generateBatch(body);
    const rows = [['Username','Password','Profile','Comment','Limit Uptime']];
    vouchers.forEach(v => rows.push([v.username, v.password, v.profile, v.comment, v.limitUptime]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vouchers-${body.profile}-${Date.now()}.csv"`);
    res.send(csv);
  }
}