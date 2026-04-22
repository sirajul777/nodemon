import { Injectable } from '@nestjs/common';
import { MikrotikService, RosClient } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';

export interface VoucherBatchRequest {
  sessionId: string;
  profile: string;
  quantity: number;
  resellerId?: string;
  resellerName?: string;
  prefix?: string;
  usernameLength?: number;
  limitUptime?: string;    // e.g. "1d", "12h", "30:00:00"
  validity?: string;       // e.g. "30d" — sets limit-uptime for auto-expire
}

export interface GeneratedVoucher {
  username: string;
  password: string;
  profile: string;
  comment: string;
  limitUptime: string;
}

@Injectable()
export class VoucherService {
  constructor(
    private mikrotikService: MikrotikService,
    private configService: ConfigService,
  ) {}

  private randomStr(len: number): string {
    // No confusing chars: 0,O,1,l,I,q,Q
    const chars = 'abcdefghjkmnprstuvwxyz23456789';
    return Array.from({ length: len }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  /**
   * Parse validity string to RouterOS duration format.
   * Accepts: "1d", "7d", "30d", "24h", "2h30m", "1:30:00"
   * Returns RouterOS format: "1d", "00:30:00", etc.
   */
  parseValidity(val: string): string {
    if (!val) return '';
    val = val.trim().toLowerCase();
    // Already in ROS format (contains :)
    if (val.includes(':')) return val;
    // Convert day/hour/min format
    const dayMatch = val.match(/^(\d+)d$/);
    if (dayMatch) return `${dayMatch[1]}d`;
    const hourMatch = val.match(/^(\d+)h$/);
    if (hourMatch) return `${parseInt(hourMatch[1]) * 3600}s`;
    const minMatch = val.match(/^(\d+)m$/);
    if (minMatch) return `${parseInt(minMatch[1]) * 60}s`;
    return val;
  }

  async generateBatch(req: VoucherBatchRequest): Promise<GeneratedVoucher[]> {
    const s = this.configService.getDecryptedSession(req.sessionId);
    if (!s) throw new Error('Session not found');

    const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
    const uLen = req.usernameLength || 5;
    const prefix = req.prefix || '';
    // SESUDAH — prefix "up" agar dikenali on-login script
const now = new Date();
const dateTag = now.toLocaleDateString('id-ID').replace(/\//g,'.').slice(0,8);
const resellerTag = (req.resellerName || req.resellerId || '')
  .toUpperCase()
  .replace(/\s+/g,'');

// Format: up-timestamp-tanggal-RESELLER
// "up" di awal = dikenali on-login script MikHMon
// Setelah login, MikroTik akan ubah comment ini ke tanggal expired
// sehingga login kedua tidak akan duplikat

    const comment = resellerTag
  ? `up-${Date.now()}-${dateTag}-${resellerTag}`
  : `up-${Date.now()}-${dateTag}`;

    // Resolve limit-uptime: explicit override OR from validity field OR from profile meta
    let limitUptime = '';
    if (req.limitUptime) {
      limitUptime = this.parseValidity(req.limitUptime);
    } else if (req.validity) {
      limitUptime = this.parseValidity(req.validity);
    } else {
      // Try to get from profile meta
      const meta = await this.getProfileMeta(req.sessionId, req.profile);
      if (meta?.validity) limitUptime = this.parseValidity(meta.validity);
    }

    // Get existing usernames to avoid duplicates
    const existing = await client.run('/ip/hotspot/user/print');
    const existingNames = new Set(existing.map(u => u.name));

    const vouchers: GeneratedVoucher[] = [];
    let attempts = 0;
    const maxAttempts = req.quantity * 15;

    while (vouchers.length < req.quantity && attempts < maxAttempts) {
      attempts++;
      const username = prefix + this.randomStr(uLen);
      if (existingNames.has(username)) continue;

      const password = this.randomStr(uLen);
      existingNames.add(username);

      const params: Record<string, string> = {
        name: username,
        password: password,
        profile: req.profile,
      };
      if (comment) params.comment = comment;
      if (limitUptime) params['limit-uptime'] = limitUptime;

      try {
        await client.run('/ip/hotspot/user/add', params);
        vouchers.push({ username, password, profile: req.profile, comment, limitUptime });
      } catch {}
    }

    client.close();
    return vouchers;
  }

  private async getProfileMeta(sessionId: string, profileName: string): Promise<{ price: number; validity: string } | null> {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(process.cwd(), 'data', 'profile-meta.json');
    try {
      if (fs.existsSync(file)) {
        const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
        return meta[sessionId]?.[profileName] || null;
      }
    } catch {}
    return null;
  }

  async getProfiles(sessionId: string) {
    const s = this.configService.getDecryptedSession(sessionId);
    if (!s) throw new Error('Session not found');
    const profiles = await this.mikrotikService.run(s.ip, s.user, s.password, '/ip/hotspot/user/profile/print', {}, s.port || 8728);

    // Merge with local meta (price, validity)
    const meta = this.getAllProfileMeta(sessionId);
    return profiles.map(p => ({
      ...p,
      price: meta[p.name]?.price || 0,
      validity: meta[p.name]?.validity || '',
    }));
  }

  private getAllProfileMeta(sessionId: string): Record<string, { price: number; validity: string }> {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(process.cwd(), 'data', 'profile-meta.json');
    try {
      if (fs.existsSync(file)) {
        const all = JSON.parse(fs.readFileSync(file, 'utf8'));
        return all[sessionId] || {};
      }
    } catch {}
    return {};
  }
}