import { Controller, Get, Post, Put, Delete, Patch, Param, Body, Req, UseGuards } from '@nestjs/common';
import { UserService, UserRole } from './user.service';
import { ConfigService } from '../config/config.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(
    private readonly userSvc: UserService,
    private readonly configSvc: ConfigService,
  ) {}

  @Get()
  getAll() { return this.userSvc.getAll(); }

  @Get('roles/defaults')
  getRoleDefaults() {
    return {
      admin:     this.userSvc.getRoleDefaults('admin'),
      reseller:  this.userSvc.getRoleDefaults('reseller'),
      collector: this.userSvc.getRoleDefaults('collector'),
    };
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const u = this.userSvc.getById(id);
    if (!u) return { error: 'Not found' };
    const { password, ...safe } = u;
    return safe;
  }

  @Post()
  create(@Body() body: {
    username: string; password: string; name: string;
    role: UserRole; allowedSessions?: string[];
    permissions?: any; note?: string;
  }) {
    if (!body.username || !body.password || !body.name || !body.role) {
      return { error: 'username, password, name, role wajib diisi' };
    }
    try {
      return this.userSvc.create(body);
    } catch(e: any) {
      return { error: e.message };
    }
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    try {
      const u = this.userSvc.update(id, body);
      return u || { error: 'Not found' };
    } catch(e: any) { return { error: e.message }; }
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    try {
      return { success: this.userSvc.delete(id) };
    } catch(e: any) { return { error: e.message }; }
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    try {
      const active = this.userSvc.toggleActive(id);
      return active !== null ? { success: true, active } : { error: 'Not found' };
    } catch(e: any) { return { error: e.message }; }
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    if (!body.newPassword || body.newPassword.length < 4) {
      return { error: 'Password minimal 4 karakter' };
    }
    return { success: this.userSvc.resetPassword(id, body.newPassword) };
  }

  // Change own password
  @Post('me/change-password')
  changePassword(@Req() req: any, @Body() body: { oldPassword: string; newPassword: string }) {
    const sessionUser = (req.session as any)?.mikhmon;
    if (!sessionUser) return { error: 'Tidak terautentikasi' };
    const u = this.userSvc.getByUsername(sessionUser);
    if (!u) {
      // Legacy admin (from config.json) — delegate to config service
      return { error: 'Gunakan endpoint /api/auth/change-password untuk akun legacy' };
    }
    if (!body.oldPassword || !body.newPassword) return { error: 'oldPassword dan newPassword wajib diisi' };
    if (body.newPassword.length < 4) return { error: 'Password minimal 4 karakter' };
    const ok = this.userSvc.changePassword(u.id, body.oldPassword, body.newPassword);
    return ok ? { success: true } : { error: 'Password lama tidak sesuai' };
  }
}