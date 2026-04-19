import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type UserRole = 'admin' | 'reseller' | 'collector';

export interface AppUser {
  id: string;
  username: string;
  password: string;        // encrypted
  name: string;
  role: UserRole;
  active: boolean;
  allowedSessions: string[]; // router sessions accessible (empty = all)
  permissions: {
    viewDashboard: boolean;
    manageVoucher: boolean;
    manageBilling: boolean;
    manageReseller: boolean;
    managePppoe: boolean;
    manageHotspot: boolean;
    viewReport: boolean;
    manageSystem: boolean;
  };
  createdAt: string;
  lastLogin?: string;
  note?: string;
}

const USER_FILE = path.join(process.cwd(), 'data', 'users.json');
const CIPHER_KEY = (process.env.CIPHER_KEY || 'mikhmon16bytekey').padEnd(16).slice(0, 16);

// Default permissions per role
const ROLE_PERMISSIONS: Record<UserRole, AppUser['permissions']> = {
  admin: {
    viewDashboard:   true,
    manageVoucher:   true,
    manageBilling:   true,
    manageReseller:  true,
    managePppoe:     true,
    manageHotspot:   true,
    viewReport:      true,
    manageSystem:    true,
  },
  reseller: {
    viewDashboard:   true,
    manageVoucher:   true,
    manageBilling:   false,
    manageReseller:  false,
    managePppoe:     false,
    manageHotspot:   false,
    viewReport:      true,
    manageSystem:    false,
  },
  collector: {
    viewDashboard:   true,
    manageVoucher:   false,
    manageBilling:   true,
    manageReseller:  false,
    managePppoe:     false,
    manageHotspot:   false,
    viewReport:      true,
    manageSystem:    false,
  },
};

@Injectable()
export class UserService {

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(CIPHER_KEY);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('base64') + ':' + encrypted.toString('base64');
  }

  private decrypt(enc: string): string {
    try {
      const [ivStr, encStr] = enc.split(':');
      const iv  = Buffer.from(ivStr, 'base64');
      const key = Buffer.from(CIPHER_KEY);
      const dec = crypto.createDecipheriv('aes-128-cbc', key, iv);
      return Buffer.concat([dec.update(Buffer.from(encStr, 'base64')), dec.final()]).toString();
    } catch { return enc; }
  }

  private load(): AppUser[] {
    try {
      if (fs.existsSync(USER_FILE)) return JSON.parse(fs.readFileSync(USER_FILE, 'utf8'));
    } catch {}
    return [];
  }

  private save(users: AppUser[]) {
    const dir = path.dirname(USER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  getAll(): Omit<AppUser, 'password'>[] {
    return this.load().map(({ password, ...u }) => u);
  }

  getById(id: string): AppUser | null {
    return this.load().find(u => u.id === id) || null;
  }

  getByUsername(username: string): AppUser | null {
    return this.load().find(u => u.username === username) || null;
  }

  create(data: {
    username: string; password: string; name: string;
    role: UserRole; allowedSessions?: string[];
    permissions?: Partial<AppUser['permissions']>; note?: string;
  }): Omit<AppUser, 'password'> {
    const users = this.load();
    if (users.find(u => u.username === data.username)) {
      throw new Error(`Username "${data.username}" sudah digunakan`);
    }
    const defaultPerms = ROLE_PERMISSIONS[data.role] || ROLE_PERMISSIONS.reseller;
    const user: AppUser = {
      id:              `USR-${Date.now()}`,
      username:        data.username,
      password:        this.encrypt(data.password),
      name:            data.name,
      role:            data.role,
      active:          true,
      allowedSessions: data.allowedSessions || [],
      permissions:     { ...defaultPerms, ...(data.permissions || {}) },
      createdAt:       new Date().toISOString(),
      note:            data.note || '',
    };
    users.push(user);
    this.save(users);
    const { password, ...safe } = user;
    return safe;
  }

  update(id: string, data: Partial<{
    name: string; role: UserRole; active: boolean;
    allowedSessions: string[];
    permissions: Partial<AppUser['permissions']>; note: string;
  }>): Omit<AppUser, 'password'> | null {
    const users = this.load();
    const idx   = users.findIndex(u => u.id === id);
    if (idx < 0) return null;
    const u = users[idx];
    if (data.name            !== undefined) u.name            = data.name;
    if (data.role            !== undefined) {
      u.role = data.role;
      // Reset to role defaults then apply overrides
      u.permissions = { ...ROLE_PERMISSIONS[data.role], ...(data.permissions || {}) };
    } else if (data.permissions !== undefined) {
      u.permissions = { ...u.permissions, ...data.permissions };
    }
    if (data.active          !== undefined) u.active          = data.active;
    if (data.allowedSessions !== undefined) u.allowedSessions = data.allowedSessions;
    if (data.note            !== undefined) u.note            = data.note;
    users[idx] = u;
    this.save(users);
    const { password, ...safe } = u;
    return safe;
  }

  changePassword(id: string, oldPassword: string, newPassword: string): boolean {
    const users = this.load();
    const u     = users.find(u => u.id === id);
    if (!u) return false;
    if (this.decrypt(u.password) !== oldPassword) return false;
    u.password = this.encrypt(newPassword);
    this.save(users);
    return true;
  }

  resetPassword(id: string, newPassword: string): boolean {
    const users = this.load();
    const u     = users.find(u => u.id === id);
    if (!u) return false;
    u.password = this.encrypt(newPassword);
    this.save(users);
    return true;
  }

  delete(id: string): boolean {
    const users = this.load();
    // Prevent deleting last admin
    const admins = users.filter(u => u.role === 'admin');
    const target = users.find(u => u.id === id);
    if (target?.role === 'admin' && admins.length <= 1) {
      throw new Error('Tidak bisa menghapus admin terakhir');
    }
    const newList = users.filter(u => u.id !== id);
    if (newList.length === users.length) return false;
    this.save(newList);
    return true;
  }

  toggleActive(id: string): boolean | null {
    const users = this.load();
    const u     = users.find(u => u.id === id);
    if (!u) return null;
    // Prevent deactivating last admin
    if (u.role === 'admin' && u.active) {
      const activeAdmins = users.filter(x => x.role === 'admin' && x.active);
      if (activeAdmins.length <= 1) throw new Error('Tidak bisa menonaktifkan admin terakhir');
    }
    u.active = !u.active;
    this.save(users);
    return u.active;
  }

  // ── Auth ───────────────────────────────────────────────────────────

  validate(username: string, password: string): Omit<AppUser, 'password'> | null {
    const users = this.load();
    const u     = users.find(u => u.username === username && u.active);
    if (!u) return null;
    if (this.decrypt(u.password) !== password) return null;
    // Update lastLogin
    u.lastLogin = new Date().toISOString();
    this.save(users);
    const { password: _, ...safe } = u;
    return safe;
  }

  updateLastLogin(id: string) {
    const users = this.load();
    const u     = users.find(u => u.id === id);
    if (u) { u.lastLogin = new Date().toISOString(); this.save(users); }
  }

  getRoleDefaults(role: UserRole) {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.reseller;
  }
}