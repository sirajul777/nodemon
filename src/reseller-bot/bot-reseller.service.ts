import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface BotReseller {
  id: string;             // unique ID
  name: string;           // display name
  username?: string;      // telegram @username
  telegramId: string;     // telegram user ID (numeric string)
  saldo: number;          // current balance
  totalVoucher: number;   // total vouchers sold
  totalIncome: number;    // total income generated
  status: 'active' | 'inactive';
  markup: number;         // price markup per voucher (Rp)
  discount: number;       // discount % from selling price
  createdAt: string;
  lastActive?: string;
  note?: string;
}

export interface TopupLog {
  reselerId: string;
  amount: number;
  type: 'topup' | 'deduct' | 'purchase';
  note: string;
  by: string;
  at: string;
  balanceBefore: number;
  balanceAfter: number;
}

const DATA_DIR   = path.join(process.cwd(), 'data');
const RESELLER_FILE = path.join(DATA_DIR, 'bot-resellers.json');
const TOPUP_FILE    = path.join(DATA_DIR, 'bot-topup-log.json');

@Injectable()
export class BotResellerService {

  private ensureDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // ── Reseller CRUD ──────────────────────────────────────────────

  loadAll(): BotReseller[] {
    try {
      if (fs.existsSync(RESELLER_FILE))
        return JSON.parse(fs.readFileSync(RESELLER_FILE, 'utf8'));
    } catch {}
    return [];
  }

  private saveAll(list: BotReseller[]) {
    this.ensureDir();
    fs.writeFileSync(RESELLER_FILE, JSON.stringify(list, null, 2));
  }

  getById(id: string): BotReseller | null {
    return this.loadAll().find(r => r.id === id) || null;
  }

  getByTelegramId(telegramId: string): BotReseller | null {
    return this.loadAll().find(r => r.telegramId === telegramId) || null;
  }

  upsert(data: Partial<BotReseller> & { name: string; telegramId: string }): BotReseller {
    const list = this.loadAll();
    const id   = data.id || `RS-${Date.now()}`;
    const idx  = list.findIndex(r => r.id === id);
    const item: BotReseller = {
      id,
      name:         data.name,
      username:     data.username || '',
      telegramId:   data.telegramId,
      saldo:        data.saldo         ?? (idx >= 0 ? list[idx].saldo : 0),
      totalVoucher: data.totalVoucher  ?? (idx >= 0 ? list[idx].totalVoucher : 0),
      totalIncome:  data.totalIncome   ?? (idx >= 0 ? list[idx].totalIncome : 0),
      status:       data.status        ?? 'active',
      markup:       data.markup        ?? 0,
      discount:     data.discount      ?? 0,
      createdAt:    data.createdAt     || (idx >= 0 ? list[idx].createdAt : new Date().toISOString()),
      lastActive:   data.lastActive,
      note:         data.note || '',
    };
    if (idx >= 0) list[idx] = item; else list.unshift(item);
    this.saveAll(list);
    return item;
  }

  delete(id: string): boolean {
    const list    = this.loadAll();
    const newList = list.filter(r => r.id !== id);
    if (newList.length === list.length) return false;
    this.saveAll(newList);
    return true;
  }

  toggleStatus(id: string): BotReseller | null {
    const list = this.loadAll();
    const item = list.find(r => r.id === id);
    if (!item) return null;
    item.status = item.status === 'active' ? 'inactive' : 'active';
    this.saveAll(list);
    return item;
  }

  // ── Balance (Saldo) ────────────────────────────────────────────

  topup(id: string, amount: number, note: string, by: string): { reseller: BotReseller; log: TopupLog } | null {
    const list = this.loadAll();
    const item = list.find(r => r.id === id);
    if (!item) return null;

    const balanceBefore = item.saldo;
    item.saldo += amount;
    const balanceAfter = item.saldo;
    this.saveAll(list);

    const log: TopupLog = {
      reselerId: id,
      amount,
      type: amount >= 0 ? 'topup' : 'deduct',
      note,
      by,
      at: new Date().toISOString(),
      balanceBefore,
      balanceAfter,
    };
    this.addLog(log);
    return { reseller: item, log };
  }

  deductSaldo(telegramId: string, amount: number, note: string): boolean {
    const list = this.loadAll();
    const item = list.find(r => r.telegramId === telegramId);
    if (!item || item.saldo < amount) return false;
    item.saldo -= amount;
    item.totalVoucher++;
    item.totalIncome += amount;
    item.lastActive = new Date().toISOString();
    this.saveAll(list);
    this.addLog({
      reselerId: item.id,
      amount: -amount,
      type: 'purchase',
      note,
      by: 'bot',
      at: new Date().toISOString(),
      balanceBefore: item.saldo + amount,
      balanceAfter: item.saldo,
    });
    return true;
  }

  // ── Topup Log ──────────────────────────────────────────────────

  loadLogs(resellerId?: string): TopupLog[] {
    try {
      if (fs.existsSync(TOPUP_FILE)) {
        const all: TopupLog[] = JSON.parse(fs.readFileSync(TOPUP_FILE, 'utf8'));
        return resellerId ? all.filter(l => l.reselerId === resellerId) : all;
      }
    } catch {}
    return [];
  }

  private addLog(log: TopupLog) {
    this.ensureDir();
    const logs = this.loadLogs();
    logs.unshift(log);
    if (logs.length > 1000) logs.splice(1000);
    fs.writeFileSync(TOPUP_FILE, JSON.stringify(logs, null, 2));
  }
}