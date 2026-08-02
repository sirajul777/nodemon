import { Controller, Get, Post, Put, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { VoucherTypeService, VoucherType } from './voucher-type.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@Controller('api/voucher-types')
@UseGuards(AuthGuard)
@UseGuards(PermissionsGuard)
@RequirePermission('manageVoucher')
export class VoucherTypeController {
  constructor(private readonly vtService: VoucherTypeService) {}

  @Get()
  getAll() { return this.vtService.getAll(); }

  @Get('active')
  getActive() { return this.vtService.getActive(); }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const v = await this.vtService.getById(id);
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
  async delete(@Param('id') id: string) {
    return { success: await this.vtService.delete(id) };
  }

  @Patch(':id/toggle')
  async toggle(@Param('id') id: string) {
    const v = await this.vtService.toggleActive(id);
    return v ? { success: true, active: v.active } : { error: 'Not found' };
  }
}

