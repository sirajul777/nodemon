import { Controller, Get, Post, Put, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { VoucherTypeService, VoucherType } from './voucher-type.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/voucher-types')
@UseGuards(AuthGuard)
export class VoucherTypeController {
  constructor(private readonly vtService: VoucherTypeService) {}

  @Get()
  getAll() { return this.vtService.getAll(); }

  @Get('active')
  getActive() { return this.vtService.getActive(); }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const v = this.vtService.getById(id);
    return v || { error: 'Not found' };
  }

  @Post()
  create(@Body() body: any) {
    if (!body.name || !body.profile) return { error: 'name dan profile wajib diisi' };
    return this.vtService.upsert(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.vtService.upsert({ ...body, id });
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return { success: this.vtService.delete(id) };
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    const v = this.vtService.toggleActive(id);
    return v ? { success: true, active: v.active } : { error: 'Not found' };
  }
}