import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { RouterSessionEntity } from '../database/entities/router-session.entity';
import { AppConfigEntity } from '../database/entities/config.entity';

export interface RouterSession {
  id: string;
  name: string;
  ip: string;
  port: number;
  user: string;
  password: string;
  hotspotName: string;
  dnsName: string;
  currency: string;
  reloadInterval: number;
  iface: string;
  idleTo: number;
  livereport: string;
}

const CIPHER_KEY = (process.env.CIPHER_KEY || 'mikhmon16bytekey').padEnd(16).slice(0, 16);

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(
    @InjectRepository(RouterSessionEntity)
    private readonly sessionRepo: Repository<RouterSessionEntity>,
    @InjectRepository(AppConfigEntity)
    private readonly configRepo: Repository<AppConfigEntity>,
  ) {}

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(CIPHER_KEY);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('base64') + ':' + encrypted.toString('base64');
  }

  decrypt(encrypted: string): string {
    try {
      const [ivStr, encStr] = encrypted.split(':');
      const iv = Buffer.from(ivStr, 'base64');
      const key = Buffer.from(CIPHER_KEY);
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encStr, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString();
    } catch {
      return encrypted;
    }
  }

  // ── Admin Config (singleton row) ──────────────────────────────

  private async getAdminConfig(): Promise<AppConfigEntity> {
    let row = await this.configRepo.findOne({ where: { key: 'default' } });
    if (!row) {
      row = this.configRepo.create({
        key: 'default',
        adminUser: 'mikhmon',
        adminPass: this.encrypt('1234'),
        currency: 'Rp',
      });
      row = await this.configRepo.save(row);
    }
    return row;
  }

  async validateAdmin(user: string, pass: string): Promise<boolean> {
    const cfg = await this.getAdminConfig();
    return user === cfg.adminUser && pass === this.decrypt(cfg.adminPass);
  }

  async changeAdminPassword(username: string, newPassword: string): Promise<boolean> {
    const cfg = await this.getAdminConfig();
    if (username !== cfg.adminUser) return false;
    cfg.adminPass = this.encrypt(newPassword);
    await this.configRepo.save(cfg);
    return true;
  }

  async getAdminUser(): Promise<string> {
    const cfg = await this.getAdminConfig();
    return cfg.adminUser;
  }

  // ── Router Sessions ───────────────────────────────────────────

  private toInterface(e: RouterSessionEntity): RouterSession {
    return {
      id: e.id,
      name: e.name,
      ip: e.ip,
      port: e.port,
      user: e.user,
      password: e.password,
      hotspotName: e.hotspotName,
      dnsName: e.dnsName,
      currency: e.currency,
      reloadInterval: e.reloadInterval,
      iface: e.iface,
      idleTo: e.idleTo,
      livereport: e.livereport,
    };
  }

  async getSessions(): Promise<Record<string, RouterSession>> {
    const rows = await this.sessionRepo.find();
    const result: Record<string, RouterSession> = {};
    for (const r of rows) result[r.id] = this.toInterface(r);
    return result;
  }

  async getSession(id: string): Promise<RouterSession | null> {
    const row = await this.sessionRepo.findOne({ where: { id } });
    return row ? this.toInterface(row) : null;
  }

  async saveSession(session: RouterSession): Promise<void> {
    const row = this.sessionRepo.create({
      id: session.id,
      name: session.name,
      ip: session.ip,
      port: session.port,
      user: session.user,
      password: session.password,
      hotspotName: session.hotspotName || '',
      dnsName: session.dnsName || '',
      currency: session.currency || 'Rp',
      reloadInterval: session.reloadInterval || 10,
      iface: session.iface || 'ether1',
      idleTo: session.idleTo || 0,
      livereport: session.livereport || 'enable',
    });
    await this.sessionRepo.save(row);
  }

  async deleteSession(id: string): Promise<void> {
    await this.sessionRepo.delete({ id });
  }

  async getAllSessions(): Promise<Record<string, RouterSession>> {
    return this.getSessions();
  }

  async getDecryptedSession(id: string): Promise<RouterSession | null> {
    const s = await this.getSession(id);
    if (!s) return null;
    return { ...s, password: this.decrypt(s.password) };
  }

  isIndoCurrency(currency: string): boolean {
    return ['RP','Rp','rp','IDR','idr','RP.','Rp.','rp.','IDR.','idr.'].includes(currency);
  }
}

