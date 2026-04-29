import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { MikrotikService } from './mikrotik.service';
import { ConfigService } from '../config/config.service';
import { AuthGuard } from '../auth/auth.guard';
import * as fs from 'fs';
import * as path from 'path';

@Controller('api/mikrotik')
@UseGuards(AuthGuard)
export class MikrotikController {
  constructor(
    private readonly mikrotikService: MikrotikService,
    private readonly configService: ConfigService,
  ) {}

  private getConn(sessionId: string) {
    const s = this.configService.getDecryptedSession(sessionId);
    if (!s) throw new Error(`Session "${sessionId}" not found`);
    return { ip: s.ip, user: s.user, password: s.password, port: s.port || 8728 };
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  /**
   * Parse MikHMon on-login script header.
   * Format: :put (",expmode,price,validity,sprice,,lockuser,");
   */
  private parseOnLogin(onLogin: string) {
    const empty = { expmode: '', price: 0, validity: '', sprice: 0, lockUser: '' };
    if (!onLogin) return empty;
    const match = onLogin.match(/:put \("([^"]*)"\)/);
    if (!match) return empty;
    const p = match[1].split(',');
    return {
      expmode:  (p[1] || '').trim(),
      price:    parseFloat(p[2]) || 0,
      validity: (p[3] || '').trim(),
      sprice:   parseFloat(p[4]) || 0,
      lockUser: (p[6] || '').trim(),
    };
  }

  /**
   * Build full MikHMon-compatible on-login script.
   *
   * ROS 7: date format is YYYY-MM-DD so needs arraybln conversion.
   * ROS 6: date format is Mon/DD/YYYY — no conversion needed.
   *
   * Format of header line (always first):
   *   :put (",expmode,price,validity,sprice,,lockuser,");
   */
  private buildOnLoginScript(
    expmode: string, price: number, validity: string,
    sprice: number, lockUser: string,
    profileName: string, rosVersion: string,
  ): string {

    const header = `:put (",${expmode},${price},${validity},${sprice},,${lockUser},");`;

    // Lock user snippet
    const lockSnip = lockUser === 'Enable'
      ? ` [:local mac $"mac-address"; /ip hotspot user set mac-address=$mac [find where name=$user]]`
      : '';

    // Record script (write selling log as a system script)
    const recordSnip = (expmode === 'remc' || expmode === 'ntfc')
      ? ` :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-${price}-|-$address-|-$mac-|-${validity}-|-${profileName}-|-$comment" owner="$month$year" source="$date" comment="mikhmon";`
      : '';

    if (rosVersion === '7') {
      // ROS 7: date comes as YYYY-MM-DD, needs conversion to mon/dd/yyyy
      const body = `{:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ]; /sys sch add name="$user" disable=no start-date=$date interval="${validity}"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);}; :local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment="$exp" [find where name="$user"];}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];}; :if ($getxp > 15) do={ /ip hotspot user set comment="$exp" [find where name="$user"];};:delay 5s; /sys sch remove [find where name="$user"];${recordSnip}${lockSnip}}}`;
      return `${header} ${body}`;
    } else {
      // ROS 6: date already in mon/dd/yyyy format
      const body = `{:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ :local date [ /system clock get date ];:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ]; /sys sch add name="$user" disable=no start-date=$date interval="${validity}"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run]; :local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment="$exp" [find where name="$user"];}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];}; :if ($getxp > 15) do={ /ip hotspot user set comment="$exp" [find where name="$user"];};:delay 5s; /sys sch remove [find where name="$user"];${recordSnip}${lockSnip}}}`;
      return `${header} ${body}`;
    }
  }

  /** Build only the header line (for reading back metadata) */
  private buildOnLoginHeader(expmode: string, price: number, validity: string, sprice: number, lockUser: string): string {
    return `:put (",${expmode},${price},${validity},${sprice},,${lockUser},");`;
  }

  private readProfileMeta(sessionId: string): Record<string, { price: number; validity: string; profileColor?: string; caption?: string }> {
    const file = path.join(process.cwd(), 'data', 'profile-meta.json');
    try {
      if (fs.existsSync(file)) {
        const all = JSON.parse(fs.readFileSync(file, 'utf8'));
        return all[sessionId] || {};
      }
    } catch {}
    return {};
  }

  private writeProfileMeta(sessionId: string, profileName: string, price: number, validity: string, profileColor?: string, caption?: string) {
    const file = path.join(process.cwd(), 'data', 'profile-meta.json');
    let all: any = {};
    try { if (fs.existsSync(file)) all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (!all[sessionId]) all[sessionId] = {};
    all[sessionId][profileName] = { price, validity, ...(profileColor ? { profileColor } : {}), ...(caption !== undefined ? { caption } : {}) };
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
  }

  private mergeProfile(sessionId: string, p: any): any {
    const ol   = this.parseOnLogin(p['on-login'] || '');
    const meta = this.readProfileMeta(sessionId);
    const loc: { price?: number; validity?: string; profileColor?: string; caption?: string } = meta[p.name] || {};
    
    // Prioritaskan data dari script MikroTik (ol), jika tidak ada baru pakai lokal (loc)
    return {
      ...p,
      price:        ol.price    || loc.price    || 0,
      sprice:       ol.sprice   || 0,
      validity:     ol.validity || loc.validity || '',
      expmode:      ol.expmode  || '',
      lockUser:     ol.lockUser || '',
      profileColor: loc.profileColor || '#1f6feb',
      caption:      loc.caption || '',
    };
  }

  // ── Connection test ───────────────────────────────────────────────────────────

  @Get(':session/connect/test')
  async testConnect(@Param('session') session: string) {
    try {
      const { ip, user, password, port } = this.getConn(session);
      const client = await this.mikrotikService.createClient(ip, user, password, port);
      const now = new Date();
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const mm   = months[now.getMonth()];
      const dd   = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      const idbl = `${mm}${yyyy}`;
      const [identity, resource] = await Promise.all([
        client.run('/system/identity/print'),
        client.run('/system/resource/print'),
        client.run('/system/script/add',{'?name':'nodemon','?owner':idbl,'?source':'nodemon'}),
      ]);
      client.close();
      return { success: true, identity: identity[0]?.name, rosVersion: resource[0]?.version };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  @Get(':session/dashboard')
  async dashboard(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const [resource, routerboard, identity, clock] = await Promise.all([
        client.run('/system/resource/print'),
        client.run('/system/routerboard/print'),
        client.run('/system/identity/print'),
        client.run('/system/clock/print'),
      ]);
      let health = [];
      try { health = await client.run('/system/health/print'); } catch {}
      const [activeCount, totalCount] = await Promise.all([
        client.run('/ip/hotspot/active/print', { 'count-only': '' }),
        client.run('/ip/hotspot/user/print', { 'count-only': '' }),
      ]);
      return {
        resource: resource[0], routerboard: routerboard[0],
        identity: identity[0]?.name, clock: clock[0], health,
        rosVersion: resource[0]?.version?.charAt(0) || '7',
        hotspot: {
          active: activeCount[0]?.ret ?? activeCount.length,
          total:  totalCount[0]?.ret  ?? totalCount.length,
        },
      };
    } finally { client.close(); }
  }

  // ── Hotspot Users ─────────────────────────────────────────────────────────────

  @Get(':session/hotspot/active')
  async hotspotActive(@Param('session') session: string, @Query('server') server?: string) {
    const { ip, user, password, port } = this.getConn(session);
    const params: Record<string, string> = {};
    if (server) params['?server'] = server;
    return this.mikrotikService.run(ip, user, password, '/ip/hotspot/active/print', params, port);
  }

  @Get(':session/hotspot/users')
  async hotspotUsers(
    @Param('session') session: string,
    @Query('profile') profile?: string,
    @Query('comment') comment?: string,
  ) {
    const { ip, user, password, port } = this.getConn(session);
    const params: Record<string, string> = {};
    if (profile && profile !== 'all') params['?profile'] = profile;
    if (comment) params['?comment'] = comment;
    return this.mikrotikService.run(ip, user, password, '/ip/hotspot/user/print', params, port);
  }

  @Post(':session/hotspot/users')
  async addHotspotUser(@Param('session') session: string, @Body() body: any) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const params: Record<string, string> = {
        name: body.name,
        password: body.password || '',
        profile: body.profile || 'default',
      };
      if (body.comment)        params.comment        = body.comment;
      if (body['limit-uptime'])params['limit-uptime']= body['limit-uptime'];
      await client.run('/ip/hotspot/user/add', params);
      return { success: true };
    } finally { client.close(); }
  }

  @Delete(':session/hotspot/users/:name')
  async removeHotspotUser(@Param('session') session: string, @Param('name') name: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const users = await client.run('/ip/hotspot/user/print', { '?name': name });
      if (users[0]?.['.id']) await client.run('/ip/hotspot/user/remove', { '.id': users[0]['.id'] });
      return { success: true };
    } finally { client.close(); }
  }

  @Post(':session/hotspot/users/bulk-delete')
  async bulkRemoveHotspotUsers(@Param('session') session: string, @Body() body: { names: string[] }) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      for (const name of body.names) {
        const users = await client.run('/ip/hotspot/user/print', { '?name': name });
        if (users[0]?.['.id']) await client.run('/ip/hotspot/user/remove', { '.id': users[0]['.id'] });
      }
      return { success: true, count: body.names.length };
    } finally { client.close(); }
  }

  // ── Hotspot Profiles ──────────────────────────────────────────────────────────

  @Get(':session/hotspot/profiles')
  async hotspotProfiles(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const profiles = await client.run('/ip/hotspot/user/profile/print');
      return profiles.map(p => this.mergeProfile(session, p));
    } catch (err: any) {
      return { error: err.message };
    } finally {
      client.close();
    }
  }

  @Get(':session/hotspot/profiles/:name')
  async getProfile(@Param('session') session: string, @Param('name') name: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': name });
      if (!profiles[0]) return null;
      return this.mergeProfile(session, profiles[0]);
    } finally { client.close(); }
  }

  @Post(':session/hotspot/profiles')
  async addProfile(@Param('session') session: string, @Body() body: any) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const price    = parseFloat(body.price)  || 0;
      const sprice   = parseFloat(body.sprice) || 0;
      const validity = (body.validity || '').trim();
      const expmode  = body.expmode  || 'remc';
      const lockUser = body.lockUser || '';

      // Detect ROS version for correct on-login script
      const resInfo = await client.run('/system/resource/print');
      const rosVer  = resInfo[0]?.version?.charAt(0) === '6' ? '6' : '7';

      const onLogin = this.buildOnLoginScript(expmode, price, validity, sprice, lockUser, body.name, rosVer);

      const params: Record<string, string> = {
        name:       body.name,
        'on-login': onLogin,
      };
      if (body['session-timeout']) params['session-timeout'] = body['session-timeout'];
      if (body['idle-timeout'])    params['idle-timeout']    = body['idle-timeout'];
      if (body['rate-limit'])      params['rate-limit']      = body['rate-limit'];
      if (body['shared-users'])    params['shared-users']    = body['shared-users'];
      if (body['address-pool'])    params['address-pool']    = body['address-pool'];

      await client.run('/ip/hotspot/user/profile/add', params);
      this.writeProfileMeta(session, body.name, price, validity, body.profileColor, body.caption);
      await this.setupExpiryScheduler(client, session);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally { client.close(); }
  }

  @Put(':session/hotspot/profiles/:name')
  async editProfile(@Param('session') session: string, @Param('name') name: string, @Body() body: any) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      // Single fetch — reuse for both .id and existing on-login
      const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': name });
      if (!profiles[0]?.['.id']) return { success: false, error: 'Profile not found' };

      const existingOnLogin = profiles[0]['on-login'] || '';
      const currentMeta     = this.parseOnLogin(existingOnLogin);

      const newPrice    = body.price    !== undefined ? parseFloat(body.price)    : currentMeta.price;
      const newSprice   = body.sprice   !== undefined ? parseFloat(body.sprice)   : currentMeta.sprice;
      const newValidity = body.validity !== undefined ? (body.validity || '').trim() : currentMeta.validity;
      const newExpmode  = body.expmode  !== undefined ? body.expmode              : currentMeta.expmode;
      const newLockUser = body.lockUser !== undefined ? body.lockUser             : currentMeta.lockUser;

      // Detect ROS version to generate correct on-login script
      const resInfo = await client.run('/system/resource/print');
      const rosVer  = resInfo[0]?.version?.charAt(0) === '6' ? '6' : '7';

      // If any MikHMon metadata changed → rebuild full script; else keep existing body
      const metaChanged = body.price !== undefined || body.validity !== undefined ||
                          body.expmode !== undefined || body.lockUser !== undefined;

      let newOnLogin: string;
      if (metaChanged) {
        // Full rebuild with correct ROS version script
        newOnLogin = this.buildOnLoginScript(
          newExpmode, newPrice, newValidity, newSprice, newLockUser,
          name, rosVer,
        );
      } else {
        // Only update header, keep existing script body
        const header  = this.buildOnLoginHeader(newExpmode, newPrice, newValidity, newSprice, newLockUser);
        const oldBody = existingOnLogin.replace(/:put\s*\("[^"]*"\);?\s*/g, '').trim();
        newOnLogin = oldBody ? `${header} ${oldBody}` : header;
      }

      const params: Record<string, string> = {
        '.id':      profiles[0]['.id'],
        'on-login': newOnLogin,
      };
      if (body['session-timeout'] !== undefined) params['session-timeout'] = body['session-timeout'] || '00:00:00';
      if (body['idle-timeout']    !== undefined) params['idle-timeout']    = body['idle-timeout']    || '';
      if (body['rate-limit']      !== undefined) params['rate-limit']      = body['rate-limit']      || '';
      if (body['shared-users']    !== undefined) params['shared-users']    = body['shared-users']    || '1';
      if (body['address-pool']    !== undefined) params['address-pool']    = body['address-pool']    || 'none';

      await client.run('/ip/hotspot/user/profile/set', params);
      this.writeProfileMeta(session, name, newPrice, newValidity, body.profileColor, body.caption);
      await this.setupExpiryScheduler(client, session);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally { client.close(); }
  }

  // Tambah method helper untuk setup scheduler cleanup
  private async setupExpiryScheduler(client: any, sessionId: string) {
    const SCHEDULER_NAME = 'mikhmon-cleanup-expired';

    // Script untuk hapus user expired
    // Cek semua hotspot user, kalau comment format tanggal dan sudah lewat → hapus
    const cleanupScript = `
  {
    :local now [/system clock get date];
    :if ([:pick $now 4 5] = "-") do={
      :local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};
      :local tgl [:pick $now 8 10];
      :local bulan [:pick $now 5 7];
      :local tahun [:pick $now 0 4];
      :local bln ($arraybln->$bulan);
      :set $now ($bln."/".$tgl."/".$tahun);
    };
    :foreach u in=[/ip hotspot user find] do={
      :local comment [/ip hotspot user get $u comment];
      :local ucode [:pick $comment 0 2];
      :if ($ucode != "vc" and $ucode != "up" and $comment != "") do={
        :local expDate [:pick $comment 0 11];
        :if ($expDate < $now) do={
          /ip hotspot user remove $u;
        };
      };
    };
  }`.replace(/\n\s+/g, ' ').trim();

    try {
      // Cek apakah scheduler sudah ada
      const existing = await client.run('/system/scheduler/print', {
        '?name': SCHEDULER_NAME
      });

      if (existing.length > 0) {
        // Update scheduler yang sudah ada
        await client.run('/system/scheduler/set', {
          '.id':     existing[0]['.id'],
          'on-event': cleanupScript,
        });
      } else {
        // Buat scheduler baru — jalan setiap jam 00:00
        await client.run('/system/scheduler/add', {
          'name':      SCHEDULER_NAME,
          'interval':  '2h',
          'start-time':'00:00:00',
          'on-event':  cleanupScript,
          'comment':   'mikhmon-auto-cleanup',
          'disabled':  'no',
        });
      }
      return true;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  @Delete(':session/hotspot/profiles/:name')
  async deleteProfile(@Param('session') session: string, @Param('name') name: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': name });
      if (!profiles[0]?.['.id']) return { success: false, error: 'Not found' };
      await client.run('/ip/hotspot/user/profile/remove', { '.id': profiles[0]['.id'] });
      return { success: true };
    } finally { client.close(); }
  }

  @Get(':session/hotspot/profile-meta')
  getProfileMeta(@Param('session') session: string) {
    return this.readProfileMeta(session);
  }

  // ── Logs & System ─────────────────────────────────────────────────────────────

  @Get(':session/hotspot/log')
  async hotspotLog(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const logs = await this.mikrotikService.run(ip, user, password, '/log/print', { '?topics': 'hotspot,info,debug' }, port);
    return logs.reverse().slice(0, 50);
  }

  @Get(':session/scheduler')
  async getScheduler(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    return this.mikrotikService.run(ip, user, password, '/system/scheduler/print', {}, port);
  }

  @Get(':session/dhcp/leases')
  async dhcpLeases(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    return this.mikrotikService.run(ip, user, password, '/ip/dhcp-server/lease/print', {}, port);
  }

  @Get(':session/system/resource')
  async systemResource(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const resource = await client.run('/system/resource/print');
      let health = [];
      try { health = await client.run('/system/health/print'); } catch {}
      return { resource: resource[0], health, rosVersion: resource[0]?.version?.charAt(0) || '7' };
    } finally { client.close(); }
  }
  @Get(':session/interface/:id/traffic') 
  async interfaceTraffic(@Param('session') session: string, @Param('name') name: string) { 
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      
       // Option A: monitor-traffic (gives bits/s directly)
      const data = await client.run('/interface/monitor-traffic', {
         '?interface' : name,});
      return {
         'tx-bits-per-second': parseInt(data['tx-bits-per-second']) || 0,
         'rx-bits-per-second': parseInt(data['rx-bits-per-second']) || 0,
      };
      
    } finally { client.close(); } 
  };

  @Get(':session/interfaces') 
  async interface(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      const data  = await client.run('/interface/print', {
         '?proplist':'name,comment,running,disabled,type'});
      return {data};
    } finally { client.close(); }
  };
}