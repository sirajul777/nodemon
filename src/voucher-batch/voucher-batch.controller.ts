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

  // DENGAN INI
  @Delete(':session/:id')
  async delete(
    @Param('session') session: string,
    @Param('id') id: string,
    @Query('deleteMikrotik') deleteMikrotik: string, // ?deleteMikrotik=true
  ) {
    const batch = this.batchService.getById(session, id);
    if (!batch) return { success: false, error: 'Batch tidak ditemukan' };

    let deletedFromMikrotik = 0;
    let failedFromMikrotik  = 0;

    // Hapus user dari MikroTik jika diminta
    if (deleteMikrotik === 'true') {
      const { ip, user, password, port } = this.getConn(session);
      const client = await this.mikrotikService.createClient(ip, user, password, port);
      try {
        for (const vcr of batch.vouchers) {
          // Hanya hapus yang masih available — yang used biarkan (sudah expired)
          if (vcr.status !== 'available') continue;
          try {
            const found = await client.run('/ip/hotspot/user/print', { '?name': vcr.username });
            if (found[0]?.['.id']) {
              await client.run('/ip/hotspot/user/remove', { '.id': found[0]['.id'] });
              deletedFromMikrotik++;
            }
          } catch {
            failedFromMikrotik++;
          }
        }
      } finally {
        client.close();
      }
    }

    // Hapus batch dari lokal
    const success = this.batchService.deleteBatch(session, id);

    return {
      success,
      deletedFromMikrotik,
      failedFromMikrotik,
    };
  }

  @Post(':session/:id/mark-used')
  markUsed(
    @Param('session') session: string,
    @Param('id') id: string,
    @Body() body: { username: string; usedBy: string },
  ) {
    return { success: this.batchService.markUsed(session, id, body.username, body.usedBy) };
  }

  @Post(':session/sync-used')
  async syncUsedFromMikrotik(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);

    try {
      const batches = this.batchService.loadAll(session);
      if (!batches.length) return { success: true, updated: 0, message: 'Tidak ada batch' };

      // Ambil semua hotspot user dari MikroTik
      const hsUsers = await client.run('/ip/hotspot/user/print').catch(() => []);

      // Buat map username -> data user (lebih cepat lookup)
      const hsMap: Record<string, any> = {};
      for (const u of hsUsers) {
        if (u.name) hsMap[u.name] = u;
      }

      let updated = 0;

      for (const batch of batches) {
        let batchChanged = false;

        for (const vcr of batch.vouchers) {
          if (vcr.status === 'used') continue; // skip yang sudah used

          const hsUser = hsMap[vcr.username];
          if (!hsUser) continue;

          const comment = hsUser.comment || '';

          // Cek apakah sudah pernah dipakai:
          // 1. Comment berformat tanggal (jan/dd/yyyy atau yyyy-mm-dd) = sudah expired/dipakai
          // 2. bytes-in > 0 = pernah ada traffic
          const hasDateComment = /^\w{3}\/\d{2}\/\d{4}/.test(comment) ||
                                /^\d{4}-\d{2}-\d{2}/.test(comment);
          const hasTraffic     = parseInt(hsUser['bytes-in'] || '0') > 0;

          if (hasDateComment || hasTraffic) {
            vcr.status  = 'used';
            vcr.usedBy  = 'Hotspot';
            vcr.usedAt  = comment || new Date().toLocaleString('id-ID');
            batchChanged = true;
            updated++;
          }
        }

        // Simpan batch jika ada perubahan
        if (batchChanged) {
          this.batchService.saveBatch(batch);
        }
      }

      return { success: true, updated };

    } finally {
      client.close();
    }
  }
  @Post(':session/auto-sync-used')
  async autoSyncUsed(@Param('session') session: string) {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);

    try {
      const batches = this.batchService.loadAll(session);
      if (!batches.length) return { success: true, updated: 0 };

      // Kumpulkan semua username dari batch yang masih available
      const availableMap: Record<string, { batchIdx: number; vcrIdx: number }> = {};
      batches.forEach((batch, bi) => {
        batch.vouchers.forEach((vcr, vi) => {
          if (vcr.status === 'available') {
            availableMap[vcr.username] = { batchIdx: bi, vcrIdx: vi };
          }
        });
      });

      if (!Object.keys(availableMap).length) {
        return { success: true, updated: 0, message: 'Tidak ada voucher available' };
      }

      // Ambil hotspot users hanya untuk username yang ada di batch
      // Lebih efisien daripada ambil semua
      const hsUsers = await client.run('/ip/hotspot/user/print').catch(() => []);

      let updated = 0;
      const changedBatches = new Set<number>();

      for (const hsUser of hsUsers) {
        const username = hsUser.name || '';
        if (!availableMap[username]) continue; // bukan dari batch kita

        const comment = hsUser.comment || '';

        // Cek apakah comment sudah berubah ke format tanggal
        // Format ROS7: jan/19/2026 atau jan/19/2026 12:00:00
        // Format ROS6: jan/19/2026 atau similar
        const isExpired = /^\w{3}\/\d{2}\/\d{4}/.test(comment) ||
                          /^\d{4}-\d{2}-\d{2}/.test(comment);

        // Cek limit-uptime habis (bytes-in > 0 dan tidak ada di active)
        const bytesIn = parseInt(hsUser['bytes-in'] || '0') > 0;

        if (isExpired || bytesIn) {
          const { batchIdx, vcrIdx } = availableMap[username];
          const vcr = batches[batchIdx].vouchers[vcrIdx];

          vcr.status = 'used';
          vcr.usedBy = isExpired ? 'Hotspot (expired)' : 'Hotspot (traffic)';
          vcr.usedAt = comment || new Date().toLocaleString('id-ID');

          changedBatches.add(batchIdx);
          updated++;
        }
      }

      // Simpan hanya batch yang berubah
      for (const bi of changedBatches) {
        this.batchService.saveBatch(batches[bi]);
      }

      return { success: true, updated };

    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      client.close();
    }
  }
  // Tambah di bawah endpoint mark-used
  @Post(':session/sync-to-report')
  async syncToReport(
    @Param('session') session: string,
    @Body() body: { batchId?: string }, // kosong = sync semua batch
  ) {
    if (!session) return { success: false, error: 'Session tidak ditemukan' };
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikService.createClient(ip, user, password, port);

    try {
      // Ambil semua batch atau batch tertentu
      const batches = body.batchId
        ? [this.batchService.getById(session, body.batchId)].filter(Boolean)
        : this.batchService.loadAll(session);

      if (!batches.length) return { success: false, error: 'Tidak ada batch ditemukan' };

      // Ambil script yang sudah ada agar tidak duplikat
      const existingScripts = await client.run('/system/script/print').catch(() => []);
      const existingNames = new Set(existingScripts.map((s: any) => s.name || ''));

      const now    = new Date();
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const mm     = months[now.getMonth()];
      const yyyy   = now.getFullYear();
      const owner  = `${mm}${yyyy}`;

      let created = 0, skipped = 0, errors = 0;

      for (const batch of batches) {
        if (!batch) continue;

        // Hanya proses voucher yang statusnya 'used'
        const usedVouchers = batch.vouchers.filter(v => v.status === 'used');

        for (const vcr of usedVouchers) {
          try {
            // Format tanggal untuk script name
            const usedDate = vcr.usedAt
              ? this.parseUsedDate(vcr.usedAt, mm, yyyy)
              : `${mm}/${String(now.getDate()).padStart(2,'0')}/${yyyy}`;

            const time = vcr.usedAt
              ? this.parseUsedTime(vcr.usedAt)
              : '00:00:00';

             
              const dateTag = now.toLocaleDateString('id-ID').replace(/\//g,'.').slice(0,8);
              const resellerTag = (batch.resellerId || batch.resellerId || '')
                .toUpperCase()
                .replace(/\s+/g,'');

            // Format nama script MikHMon:
            // date-|-time-|-username-|-price-|-address-|-mac-|-validity-|-profile-|-comment
            const scriptName = [
              usedDate,
              time,
              vcr.username,
              String(batch.price || 0),
              '0.0.0.0',         // address tidak diketahui
              '00:00:00:00:00:00', // mac tidak diketahui
              batch.validity || '',
              batch.profileName,
              resellerTag ? `up-${Date.now()}-${dateTag}-${resellerTag}` : `up-${Date.now()}-${dateTag}`,
            ].join('-|-');

            // Skip jika sudah ada
            if (existingNames.has(scriptName)) { skipped++; continue; }

            // Buat script di MikroTik
            await client.run('/system/script/add', {
              name:    scriptName,
              owner:   owner,
              source:  usedDate,
              comment: 'mikhmon',
            });

            existingNames.add(scriptName);
            created++;
          } catch (e) {
            errors++;
          }
        }
      }

      return { success: true, created, skipped, errors };

    } finally {
      client.close();
    }
  }

  // Helper parse tanggal dari format lokal id-ID
  private parseUsedDate(usedAt: string, fallbackMm: string, fallbackYyyy: number): string {
    try {
      // usedAt bisa format: "19/4/2026, 03.54.14" atau ISO string
      const d = new Date(usedAt.includes('T') ? usedAt : usedAt.replace(',',''));
      if (isNaN(d.getTime())) throw new Error();
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const mm  = months[d.getMonth()];
      const dd  = String(d.getDate()).padStart(2,'0');
      const yy  = d.getFullYear();
      return `${mm}/${dd}/${yy}`;
    } catch {
      return `${fallbackMm}/${String(new Date().getDate()).padStart(2,'0')}/${fallbackYyyy}`;
    }
  }

  private parseUsedTime(usedAt: string): string {
    try {
      const d = new Date(usedAt.includes('T') ? usedAt : usedAt.replace(',',''));
      if (isNaN(d.getTime())) throw new Error();
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    } catch {
      return '00:00:00';
    }
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