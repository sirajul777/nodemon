import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { VoucherBatchService, VoucherBatch, VoucherItem } from './voucher-batch.service';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/batches')
@UseGuards(AuthGuard)
export class VoucherBatchController {
  constructor(
    private readonly batchService: VoucherBatchService,
    private readonly mikrotikService: MikrotikService,
    private readonly configService: ConfigService,
  ) {}

  private getConn(sessionId: string) {
    const s = this.configService.getDecryptedSession(sessionId);
    if (!s) throw new Error(`Session "${sessionId}" not found`);
    return { ip: s.ip, user: s.user, password: s.password, port: s.port || 8728 };
  }

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

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  @Get(':session')
  getAll(@Param('session') session: string) {
    return this.batchService.loadAll(session)
      .map(b => ({ ...b, stats: this.batchService.getStats(b) }));
  }

  @Get(':session/:id')
  getOne(@Param('session') session: string, @Param('id') id: string) {
    const b = this.batchService.getById(session, id);
    if (!b) return { error: 'Not found' };
    return { ...b, stats: this.batchService.getStats(b) };
  }

  @Post(':session')
  create(@Param('session') session: string, @Body() body: VoucherBatch) {
    body.sessionId = session;
    if (!body.id) body.id = `BATCH-${Date.now()}`;
    if (!body.createdAt) body.createdAt = new Date().toISOString();
    return this.batchService.saveBatch(body);
  }

  @Delete(':session/:id')
  delete(@Param('session') session: string, @Param('id') id: string) {
    return { success: this.batchService.deleteBatch(session, id) };
  }

  @Post(':session/:id/mark-used')
  markUsed(
    @Param('session') session: string,
    @Param('id') id: string,
    @Body() body: { username: string; usedBy: string },
  ) {
    return { success: this.batchService.markUsed(session, id, body.username, body.usedBy) };
  }

  // ── Step 1: Get list of profiles (fast, no user data) ─────────────────────────

  @Get(':session/import/profiles')
  async getImportProfiles(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);
    try {
      // Fetch profiles + count users per profile (count-only per profile is fast)
      const profiles = await client.run('/ip/hotspot/user/profile/print');

      const result: any[] = [];
      for (const p of profiles) {
        const ol = this.parseOnLogin(p['on-login'] || '');
        // Only include profiles that have MikHMon price configured
        if (!ol.price && !ol.sprice) continue;

        // Count users in this profile (fast API call)
        let count = 0;
        try {
          const cnt = await client.run('/ip/hotspot/user/print', {
            '?profile': p.name,
            'count-only': '',
          });
          count = parseInt(cnt[0]?.ret || '0') || 0;
        } catch {}

        const localMeta = this.batchService.readLocalProfileMeta(session);
        const loc = localMeta[p.name] || {};

        result.push({
          name:         p.name,
          rateLimit:    p['rate-limit'] || '',
          price:        ol.price,
          sprice:       ol.sprice,
          validity:     ol.validity,
          expmode:      ol.expmode,
          profileColor: loc.profileColor || '#1f6feb',
          caption:      loc.caption || p.name,
          userCount:    count,
        });
      }

      return { success: true, profiles: result };
    } finally {
      client.close();
    }
  }

  // ── Step 2: Import ONE profile (called per-profile from frontend) ─────────────

  @Post(':session/import/profile')
  async importOneProfile(
    @Param('session') session: string,
    @Body() body: {
      profileName: string;
      createdBy?: string;
      monthsBack?: number;  // how many months of scripts to check (default 3)
    },
  ) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);

    try {
      const profileName = body.profileName;
      const monthsBack  = body.monthsBack || 3;

      // 1. Fetch only users of this profile
      const users = await client.run('/ip/hotspot/user/print', { '?profile': profileName });

      if (!users.length) {
        return { success: true, profileName, imported: 0, message: 'Tidak ada user' };
      }

      // 2. Get profile metadata
      const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': profileName });
      const ol = this.parseOnLogin(profiles[0]?.['on-login'] || '');
      const localMeta = this.batchService.readLocalProfileMeta(session);
      const loc = localMeta[profileName] || {};
      const color   = loc.profileColor || '#1f6feb';
      const caption = loc.caption || profileName;

      // 3. Build set of sold usernames from scripts (limited months)
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const now    = new Date();
      const soldMap: Record<string, { soldAt: string; price: number }> = {};

      for (let i = 0; i < monthsBack; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const owner = months[d.getMonth()] + d.getFullYear();
        try {
          // Only fetch scripts owned by this month (fast)
          const scripts = await client.run('/system/script/print', { '?owner': owner });
          for (const sc of scripts) {
            const parts = (sc.name || '').split('-|-');
            if (parts.length >= 8 && parts[7] === profileName) {
              soldMap[parts[2]] = {
                soldAt: `${parts[0]} ${parts[1]}`,
                price:  parseFloat(parts[3]) || 0,
              };
            }
          }
        } catch {}
      }

      // 4. Get or create batch for this profile
      const batchId = `IMPORT-${profileName}-${session}`;
      const existingBatch = this.batchService.getById(session, batchId);
      const existingVcrMap: Record<string, VoucherItem> = {};
      if (existingBatch) {
        for (const v of existingBatch.vouchers) existingVcrMap[v.username] = v;
      }

      // 5. Build voucher list
      const vouchers: VoucherItem[] = users.map(u => {
        const sold    = soldMap[u.name];
        const comment = u.comment || '';
        const existing = existingVcrMap[u.name];

        // Mark as used if: found in selling scripts OR has date comment (already expired)
        const hasDateComment = /^\w{3}\/\d{2}\/\d{4}/.test(comment) ||
                               /^\d{4}-\d{2}-\d{2}/.test(comment);
        const isUsed = !!(sold || hasDateComment);

        return {
          username:    u.name,
          password:    u.password || '',
          profile:     profileName,
          comment,
          limitUptime: u['limit-uptime'] || ol.validity || '',
          color,
          price:       ol.sprice || ol.price || 0,
          caption,
          status:      isUsed ? 'used' : (existing?.status || 'available'),
          usedBy:      sold ? 'Sold' : (hasDateComment ? 'Expired' : (existing?.usedBy || '')),
          usedAt:      sold ? sold.soldAt : (existing?.usedAt || ''),
        } as VoucherItem;
      });

      const batch: VoucherBatch = {
        id:           batchId,
        profileName,
        profileColor: color,
        price:        ol.sprice || ol.price || 0,
        totalPrice:   (ol.sprice || ol.price || 0) * vouchers.length,
        validity:     ol.validity || '',
        caption,
        sessionId:    session,
        nasName:      session,
        createdBy:    body.createdBy || 'Import',
        createdAt:    existingBatch?.createdAt || new Date().toISOString(),
        vouchers,
      };

      this.batchService.saveBatch(batch);
      const stats = this.batchService.getStats(batch);

      return {
        success: true,
        profileName,
        batchId,
        imported: vouchers.length,
        available: stats.remaining,
        used: stats.used,
      };

    } catch (err: any) {
      return { success: false, profileName: body.profileName, error: err.message };
    } finally {
      client.close();
    }
  }
}