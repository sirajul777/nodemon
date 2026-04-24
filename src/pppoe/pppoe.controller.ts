import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';
import { AuthGuard } from '../auth/auth.guard';
import * as fs from 'fs';
import * as path from 'path';

@Controller('api/pppoe')
@UseGuards(AuthGuard)
export class PppoeController {
  constructor(private mikrotikService: MikrotikService, private configService: ConfigService) {}

  private conn(id: string) {
    const s = this.configService.getDecryptedSession(id);
    if (!s) throw new Error(`Session "${id}" not found`);
    return { ip: s.ip, user: s.user, password: s.password, port: s.port || 8728 };
  }

  private readProfileMeta(sessionId: string): Record<string, { active: boolean }> {
    const file = path.join(process.cwd(), 'data', 'pppoe-profile-meta.json');
    try {
      if (fs.existsSync(file)) {
        const all = JSON.parse(fs.readFileSync(file, 'utf8'));
        return all[sessionId] || {};
      }
    } catch {}
    return {};
  }

  private writeProfileMeta(sessionId: string, profileName: string, active: boolean) {
    const file = path.join(process.cwd(), 'data', 'pppoe-profile-meta.json');
    let all: any = {};
    try { if (fs.existsSync(file)) all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (!all[sessionId]) all[sessionId] = {};
    all[sessionId][profileName] = { active };
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
  }

  private mergeProfile(sessionId: string, p: any): any {
    const meta = this.readProfileMeta(sessionId);
    const loc = meta[p.name] || { active: true }; // Default aktif jika belum ada di meta
    return { ...p, active: loc.active };
  }

  // Active connections
  @Get(':session/active')
  getActive(@Param('session') s: string) {
    const c = this.conn(s);
    return this.mikrotikService.run(c.ip, c.user, c.password, '/ppp/active/print', {}, c.port);
  }

  @Delete(':session/active/:id')
  async disconnectActive(@Param('session') s: string, @Param('id') id: string) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try { await client.run('/ppp/active/remove', { '.id': id }); return { success: true }; }
    finally { client.close(); }
  }

  // Secrets (PPPoE users)
  @Get(':session/secrets')
  getSecrets(@Param('session') s: string, @Query('profile') profile?: string) {
    const c = this.conn(s);
    const params: Record<string, string> = {};
    if (profile && profile !== 'all') params['?profile'] = profile;
    return this.mikrotikService.run(c.ip, c.user, c.password, '/ppp/secret/print', params, c.port);
  }

  @Get(':session/secrets/:name')
  async getSecret(@Param('session') s: string, @Param('name') name: string) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try { const r = await client.run('/ppp/secret/print', { '?name': name }); return r[0] || null; }
    finally { client.close(); }
  }

  @Post(':session/secrets')
  async addSecret(@Param('session') s: string, @Body() body: any) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const p: Record<string, string> = { name: body.name, password: body.password || '', service: body.service || 'pppoe', profile: body.profile || 'default' };
      if (body.comment) p.comment = body.comment;
      if (body['local-address']) p['local-address'] = body['local-address'];
      if (body['remote-address']) p['remote-address'] = body['remote-address'];
      await client.run('/ppp/secret/add', p);
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
    finally { client.close(); }
  }

  @Put(':session/secrets/:name')
  async editSecret(@Param('session') s: string, @Param('name') name: string, @Body() body: any) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const found = await client.run('/ppp/secret/print', { '?name': name });
      if (!found[0]?.['.id']) return { success: false, error: 'Not found' };
      const p: Record<string, string> = { '.id': found[0]['.id'] };
      if (body.password) p.password = body.password;
      if (body.profile !== undefined) p.profile = body.profile;
      if (body.service !== undefined) p.service = body.service;
      if (body.comment !== undefined) p.comment = body.comment;
      if (body['local-address'] !== undefined) p['local-address'] = body['local-address'];
      if (body['remote-address'] !== undefined) p['remote-address'] = body['remote-address'];
      await client.run('/ppp/secret/set', p);
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
    finally { client.close(); }
  }

  @Delete(':session/secrets/:name')
  async deleteSecret(@Param('session') s: string, @Param('name') name: string) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const found = await client.run('/ppp/secret/print', { '?name': name });
      if (!found[0]?.['.id']) return { success: false, error: 'Not found' };
      await client.run('/ppp/secret/remove', { '.id': found[0]['.id'] });
      return { success: true };
    } finally { client.close(); }
  }

  @Post(':session/secrets/:name/enable')
  async enableSecret(@Param('session') s: string, @Param('name') name: string) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const found = await client.run('/ppp/secret/print', { '?name': name });
      if (found[0]?.['.id']) await client.run('/ppp/secret/enable', { '.id': found[0]['.id'] });
      return { success: true };
    } finally { client.close(); }
  }

  @Post(':session/secrets/:name/disable')
  async disableSecret(@Param('session') s: string, @Param('name') name: string) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const found = await client.run('/ppp/secret/print', { '?name': name });
      if (found[0]?.['.id']) await client.run('/ppp/secret/disable', { '.id': found[0]['.id'] });
      return { success: true };
    } finally { client.close(); }
  }

  // Profiles
  @Get(':session/profiles')
  async getProfiles(@Param('session') s: string) {
    const c = this.conn(s);
    const profiles = await this.mikrotikService.run(c.ip, c.user, c.password, '/ppp/profile/print', {}, c.port);
    return profiles.map(p => this.mergeProfile(s, p));
  }

  @Get(':session/profiles/:name')
  async getProfile(@Param('session') s: string, @Param('name') name: string) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try { 
      const r = await client.run('/ppp/profile/print', { '?name': name }); 
      if (!r[0]) return null;
      return this.mergeProfile(s, r[0]);
    }
    finally { client.close(); }
  }

  @Post(':session/profiles')
  async addProfile(@Param('session') s: string, @Body() body: any) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const p: Record<string, string> = { name: body.name };
      if (body['rate-limit']) p['rate-limit'] = body['rate-limit'];
      if (body['address-pool']) p['address-pool'] = body['address-pool'];
      if (body['local-address']) p['local-address'] = body['local-address'];
      if (body['session-timeout']) p['session-timeout'] = body['session-timeout'];
      if (body['idle-timeout']) p['idle-timeout'] = body['idle-timeout'];
      if (body['only-one']) p['only-one'] = body['only-one'];
      if (body.comment) p.comment = body.comment;
      await client.run('/ppp/profile/add', p);
      
      const active = body.active !== undefined ? (body.active === 'true' || body.active === true) : true;
      this.writeProfileMeta(s, body.name, active);
      
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
    finally { client.close(); }
  }

  @Put(':session/profiles/:name')
  async editProfile(@Param('session') s: string, @Param('name') name: string, @Body() body: any) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const found = await client.run('/ppp/profile/print', { '?name': name });
      if (!found[0]?.['.id']) return { success: false, error: 'Not found' };
      const p: Record<string, string> = { '.id': found[0]['.id'] };
      if (body['rate-limit'] !== undefined) p['rate-limit'] = body['rate-limit'] || '';
      if (body['address-pool'] !== undefined) p['address-pool'] = body['address-pool'] || '';
      if (body['local-address'] !== undefined) p['local-address'] = body['local-address'] || '';
      if (body['session-timeout'] !== undefined) p['session-timeout'] = body['session-timeout'] || '';
      if (body['idle-timeout'] !== undefined) p['idle-timeout'] = body['idle-timeout'] || '';
      if (body['only-one'] !== undefined) p['only-one'] = body['only-one'];
      if (body.comment !== undefined) p.comment = body.comment;
      await client.run('/ppp/profile/set', p);
      
      if (body.active !== undefined) {
        this.writeProfileMeta(s, name, (body.active === 'true' || body.active === true));
      }
      
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
    finally { client.close(); }
  }

  @Delete(':session/profiles/:name')
  async deleteProfile(@Param('session') s: string, @Param('name') name: string) {
    const c = this.conn(s);
    const client = await this.mikrotikService.createClient(c.ip, c.user, c.password, c.port);
    try {
      const found = await client.run('/ppp/profile/print', { '?name': name });
      if (!found[0]?.['.id']) return { success: false, error: 'Not found' };
      await client.run('/ppp/profile/remove', { '.id': found[0]['.id'] });
      return { success: true };
    } finally { client.close(); }
  }

  @Get(':session/pools')
  getPools(@Param('session') s: string) {
    const c = this.conn(s);
    return this.mikrotikService.run(c.ip, c.user, c.password, '/ip/pool/print', {}, c.port);
  }
}
