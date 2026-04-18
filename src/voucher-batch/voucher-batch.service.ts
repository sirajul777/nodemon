import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_PROFILE_META = path.join(process.cwd(), 'data', 'profile-meta.json');

export interface VoucherItem {
  username: string;
  password: string;
  profile: string;
  comment?: string;
  limitUptime?: string;
  color?: string;
  price?: number;
  caption?: string;
  usedBy?: string;
  usedAt?: string;
  status: 'available' | 'used';
}

export interface VoucherBatch {
  id: string;
  profileName: string;
  profileColor: string;
  price: number;
  totalPrice: number;
  validity: string;
  caption?: string;
  sessionId: string;
  nasName: string;
  createdBy: string;
  createdAt: string;
  resellerId?: string;
  resellerName?: string;
  vouchers: VoucherItem[];
}

const DATA_DIR = path.join(process.cwd(), 'data', 'batches');

@Injectable()
export class VoucherBatchService {

  private batchFile(sessionId: string): string {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    return path.join(DATA_DIR, `${sessionId}.json`);
  }

  loadAll(sessionId: string): VoucherBatch[] {
    try {
      const f = this.batchFile(sessionId);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {}
    return [];
  }

  private saveAll(sessionId: string, batches: VoucherBatch[]): void {
    fs.writeFileSync(this.batchFile(sessionId), JSON.stringify(batches, null, 2));
  }

  getById(sessionId: string, batchId: string): VoucherBatch | null {
    return this.loadAll(sessionId).find(b => b.id === batchId) || null;
  }

  saveBatch(batch: VoucherBatch): VoucherBatch {
    const batches = this.loadAll(batch.sessionId);
    const idx = batches.findIndex(b => b.id === batch.id);
    if (idx >= 0) batches[idx] = batch;
    else batches.unshift(batch);
    this.saveAll(batch.sessionId, batches);
    return batch;
  }

  deleteBatch(sessionId: string, batchId: string): boolean {
    const batches = this.loadAll(sessionId);
    const newList = batches.filter(b => b.id !== batchId);
    if (newList.length === batches.length) return false;
    this.saveAll(sessionId, newList);
    return true;
  }

  markUsed(sessionId: string, batchId: string, username: string, usedBy: string): boolean {
    const batches = this.loadAll(sessionId);
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return false;
    const vcr = batch.vouchers.find(v => v.username === username);
    if (!vcr) return false;
    vcr.status = 'used';
    vcr.usedBy = usedBy;
    vcr.usedAt = new Date().toLocaleString('id-ID');
    this.saveAll(sessionId, batches);
    return true;
  }

  getStats(batch: VoucherBatch) {
    const used = batch.vouchers.filter(v => v.status === 'used').length;
    const total = batch.vouchers.length;
    return { total, used, remaining: total - used, usedPct: Math.round(used / total * 100) };
  }

  readLocalProfileMeta(sessionId: string): Record<string, { profileColor?: string; caption?: string }> {
    try {
      if (fs.existsSync(LOCAL_PROFILE_META)) {
        const all = JSON.parse(fs.readFileSync(LOCAL_PROFILE_META, 'utf8'));
        return all[sessionId] || {};
      }
    } catch {}
    return {};
  }
}