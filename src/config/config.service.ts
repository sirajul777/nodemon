import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

export interface AppConfig {
  adminUser: string;
  adminPass: string;
  sessions: Record<string, RouterSession>;
}

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');
const CIPHER_KEY = (process.env.CIPHER_KEY || 'mikhmon16bytekey').padEnd(16).slice(0, 16);

@Injectable()
export class ConfigService {
  private config: AppConfig;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        this.config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      } else {
        this.config = {
          adminUser: 'mikhmon',
          adminPass: this.encrypt('1234'),
          sessions: {},
        };
        this.save();
      }
    } catch {
      this.config = { adminUser: 'mikhmon', adminPass: this.encrypt('1234'), sessions: {} };
    }
  }

  private save() {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

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

  validateAdmin(user: string, pass: string): boolean {
    return user === this.config.adminUser && pass === this.decrypt(this.config.adminPass);
  }

  changeAdminPassword(username: string, newPassword: string): boolean {
    if (username !== this.config.adminUser) return false;
    this.config.adminPass = this.encrypt(newPassword);
    this.save();
    return true;
  }

  getAdminUser(): string { return this.config.adminUser; }

  getSessions(): Record<string, RouterSession> { return this.config.sessions; }

  getSession(id: string): RouterSession | null {
    return this.config.sessions[id] || null;
  }

  saveSession(session: RouterSession) {
    this.config.sessions[session.id] = session;
    this.save();
  }

  deleteSession(id: string) {
    delete this.config.sessions[id];
    this.save();
  }

  getAllSessions(): Record<string, RouterSession> {
    return this.config?.sessions;
  }

  getDecryptedSession(id: string): RouterSession | null {
    const s = this.getSession(id);
    if (!s) return null;
    return { ...s, password: this.decrypt(s.password) };
  }

  isIndoCurrency(currency: string): boolean {
    return ['RP','Rp','rp','IDR','idr','RP.','Rp.','rp.','IDR.','idr.'].includes(currency);
  }
}