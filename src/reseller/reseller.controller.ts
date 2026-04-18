import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ResellerService, Reseller } from './reseller.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/resellers')
@UseGuards(AuthGuard)
export class ResellerController {
  constructor(private readonly resellerService: ResellerService) {}

  @Get()
  getAll() { return this.resellerService.getAll(); }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const r = this.resellerService.getById(id);
    return r || { error: 'Not found' };
  }

  @Post()
  save(@Body() body: Reseller) {
    return this.resellerService.save_reseller(body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return { success: this.resellerService.delete(id) };
  }
}