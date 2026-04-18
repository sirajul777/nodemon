import { Controller, Get, Post, Put, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { BotResellerService, BotReseller } from './bot-reseller.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/bot-resellers')
@UseGuards(AuthGuard)
export class BotResellerController {
  constructor(private readonly svc: BotResellerService) {}

  @Get()
  getAll() { return this.svc.loadAll(); }

  @Get('logs')
  getLogs() { return this.svc.loadLogs(); }

  @Get('logs/:id')
  getLogById(@Param('id') id: string) { return this.svc.loadLogs(id); }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const r = this.svc.getById(id);
    return r || { error: 'Not found' };
  }

  @Post()
  create(@Body() body: any) {
    if (!body.name || !body.telegramId)
      return { error: 'name dan telegramId wajib diisi' };
    return this.svc.upsert(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.upsert({ ...body, id });
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return { success: this.svc.delete(id) };
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    const r = this.svc.toggleStatus(id);
    return r ? { success: true, status: r.status } : { error: 'Not found' };
  }

  @Post(':id/topup')
  topup(
    @Param('id') id: string,
    @Body() body: { amount: number; note?: string; by?: string },
  ) {
    const result = this.svc.topup(id, Number(body.amount), body.note || '', body.by || 'Admin');
    return result ? { success: true, ...result } : { error: 'Reseller not found' };
  }
}