import { Injectable } from '@nestjs/common';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';
import * as path from 'path';

export interface VoucherBatchRequest {
  sessionId: string;
  profile: string;
  quantity: number;
  resellerId?: string;
  resellerName?: string;
  prefix?: string;
  usernameLength?: number;
  userType?: 'up' | 'vc'; // up: user+pass, vc: user=pass
  charType?: 'lower' | 'upper' | 'mixed' | 'digit' | 'lowerdigit' | 'upperdigit' | 'mixeddigit' | 'alphabet';
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

  private randomStr(len: number, type: VoucherBatchRequest['charType'] = 'lowerdigit'): string {
    const chars_map = {
      lower:      'abcdefghjkmnprstuvwxyz',
      upper:      'ABCDEFGHJKMNPRSTUVWXYZ',
      alphabet:   'abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ',
      digit:      '23456789',
      lowerdigit: 'abcdefghjkmnprstuvwxyz23456789',
      upperdigit: 'ABCDEFGHJKMNPRSTUVWXYZ23456789',
      mixeddigit: 'abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ23456789'
    };
    const chars = chars_map[type] || chars_map.lowerdigit;
    return Array.from({ length: len }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  parseValidity(val: string): string {
    if (!val) return '';
    val = val.trim().toLowerCase();
    if (val.includes(':')) return val;
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
    const userType = req.userType || 'up';
    const charType = req.charType || 'lowerdigit';

    const now = new Date();
    const dateTag = now.toLocaleDateString('id-ID').replace(/\//g,'.').slice(0,8);
    const resellerTag = (req.resellerName || req.resellerId || '')
      .toUpperCase()
      .replace(/\s+/g,'');

    const comment = resellerTag
    ? `up-${Date.now()}-${dateTag}-${resellerTag}`
    : `up-${Date.now()}-${dateTag}`;

    let limitUptime = '';
    if (req.limitUptime) {
      limitUptime = this.parseValidity(req.limitUptime);
    } else if (req.validity) {
      limitUptime = this.parseValidity(req.validity);
    } else {
      const meta = await this.getProfileMeta(req.sessionId, req.profile);
      if (meta?.validity) limitUptime = this.parseValidity(meta.validity);
    }

    const existing = await client.run('/ip/hotspot/user/print');
    const existingNames = new Set(existing.map(u => u.name));

    const vouchers: GeneratedVoucher[] = [];
    let attempts = 0;
    const maxAttempts = req.quantity * 15;

    while (vouchers.length < req.quantity && attempts < maxAttempts) {
      attempts++;
      const username = prefix + this.randomStr(uLen, charType);
      if (existingNames.has(username)) continue;

      const password = userType === 'vc' ? username : this.randomStr(uLen, charType);
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

    const meta = this.getAllProfileMeta(sessionId);
    return profiles.map(p => ({
      ...p,
      price: meta[p.name]?.price || 0,
      validity: meta[p.name]?.validity || '',
    }));
  }

  private getAllProfileMeta(sessionId: string): Record<string, { price: number; validity: string }> {
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
