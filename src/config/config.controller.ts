import { Controller, Get, Post, Put, Body, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { ConfigService, RouterSession } from './config.service';
import { AuthGuard } from '../auth/auth.guard';
import { Request } from 'express';

interface RequestWithSession extends Request {
  session: any;
}

@Controller('api/sessions')
@UseGuards(AuthGuard)
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getSessions(@Req() req: RequestWithSession) {
    const s = req.session;
    const allSessions = Object.values(this.configService.getSessions());
    
    // Jika bukan admin (misal reseller/collector), filter router yang diizinkan
    if (s.userRole && s.userRole !== 'admin') {
      const allowed = s.userPerms?.allowedSessions || [];
      if (allowed && allowed.length > 0) {
        return allSessions
          .filter(sess => allowed.includes(sess.id))
          .map(sess => ({ ...sess, password: '***' }));
      }
    }

    return allSessions.map(sess => ({
      ...sess, password: '***',
    }));
  }

  @Get(':id')
  getSession(@Param('id') id: string) {
    const s = this.configService.getSession(id);
    if (!s) return { error: 'Not found' };
    return { ...s, password: '***' };
  }

  @Post()
  saveSession(@Body() body: any) {
    // If password is '***' (edit without changing password), keep existing
    let encryptedPassword: string;
    const existing = this.configService.getSession(body.id);
    if (body.password === '***' && existing) {
      encryptedPassword = existing.password; // keep old encrypted password
    } else {
      encryptedPassword = this.configService.encrypt(body.password);
    }

    const session: RouterSession = {
      id: body.id || body.name.replace(/\s+/g, '_').toUpperCase(),
      name: body.name,
      ip: body.ip,
      port: parseInt(body.port) || 8728,
      user: body.user,
      password: encryptedPassword,
      hotspotName: body.hotspotName || '',
      dnsName: body.dnsName || '',
      currency: body.currency || 'Rp',
      reloadInterval: parseInt(body.reloadInterval) || 10,
      iface: body.iface || 'ether1',
      idleTo: parseInt(body.idleTo) || 0,
      livereport: body.livereport || 'enable',
    };
    this.configService.saveSession(session);
    return { success: true, session: { ...session, password: '***' } };
  }

  @Put(':id')
  editSession(@Param('id') id: string, @Body() body: any) {
    return this.saveSession({ ...body, id });
  }

  @Delete(':id')
  deleteSession(@Param('id') id: string) {
    this.configService.deleteSession(id);
    return { success: true };
  }
}