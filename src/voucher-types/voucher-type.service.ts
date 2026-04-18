import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface VoucherType {
  id: string;
  name: string;           // Display name e.g. "VOCER 1K"
  price: number;          // Selling price
  profile: string;        // MikroTik hotspot profile name
  duration: string;       // e.g. "4j", "1 hari", "30 hari"
  codeLength: number;     // Username/password length
  codeFormat: string;     // "upper+digit" | "lower+digit" | "mixed+digit"
  maxPerOrder: number;    // Max vouchers per /generate command
  active: boolean;
  createdAt: string;
}

const DATA_FILE = path.join(process.cwd(), 'data', 'voucher-types.json');

@Injectable()
export class VoucherTypeService {

  private load(): VoucherType[] {
    try {
      if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {}
    return [];
  }

  private save(data: VoucherType[]): void {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }

  getAll(): VoucherType[] {
    return this.load().sort((a, b) => a.price - b.price);
  }

  getActive(): VoucherType[] {
    return this.getAll().filter(v => v.active);
  }

  getById(id: string): VoucherType | null {
    return this.load().find(v => v.id === id) || null;
  }

  upsert(data: Partial<VoucherType> & { name: string; profile: string; price: number }): VoucherType {
    const list = this.load();
    const id = data.id || `vt_${Date.now()}`;
    const idx = list.findIndex(v => v.id === id);

    const item: VoucherType = {
      id,
      name:         data.name,
      price:        Number(data.price) || 0,
      profile:      data.profile,
      duration:     data.duration || '',
      codeLength:   Number(data.codeLength) || 6,
      codeFormat:   data.codeFormat || 'upper+digit',
      maxPerOrder:  Number(data.maxPerOrder) || 10,
      active:       data.active !== false,
      createdAt:    data.createdAt || new Date().toISOString(),
    };

    if (idx >= 0) list[idx] = item;
    else list.push(item);
    this.save(list);
    return item;
  }

  delete(id: string): boolean {
    const list = this.load();
    const newList = list.filter(v => v.id !== id);
    if (newList.length === list.length) return false;
    this.save(newList);
    return true;
  }

  toggleActive(id: string): VoucherType | null {
    const list = this.load();
    const item = list.find(v => v.id === id);
    if (!item) return null;
    item.active = !item.active;
    this.save(list);
    return item;
  }

  /**
   * Generate a username/password string based on codeFormat.
   * Formats:
   *   upper+digit   → Huruf Kapital + Angka  (ABC123)
   *   lower+digit   → Huruf Kecil + Angka    (abc123)
   *   mixed+digit   → Huruf Besar+Kecil + Angka (aB3...)
   *   digit         → Angka saja             (123456)
   */
  generateCode(vt: VoucherType): string {
    let chars: string;
    switch (vt.codeFormat) {
      case 'upper+digit': chars = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'; break;
      case 'lower+digit': chars = 'abcdefghjkmnprstuvwxyz23456789'; break;
      case 'mixed+digit': chars = 'abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ23456789'; break;
      case 'digit':       chars = '2345678901'; break;
      default:            chars = 'ABCDEFGHJKMNPRSTUVWXYZ23456789';
    }
    return Array.from({ length: vt.codeLength }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }
}