import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

export interface Reseller {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  discount: number; // percent discount from base price
  createdAt: string;
  router?: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "resellers.json");

@Injectable()
export class ResellerService {
  private load(): Record<string, Reseller> {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      }
    } catch {}
    return {};
  }

  private save(data: Record<string, Reseller>) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }

  getAll(sessionId: string): Reseller[] {
    let data = [];
    Object.values(this.load()).forEach((r) => {
      if (r.router !== sessionId) return;
      data.push(r);
    });
    return data;
  }

  getById(id: string): Reseller | null {
    return this.load()[id] || null;
  }

  save_reseller(r: Reseller): Reseller {
    const data = this.load();
    if (!r.id)
      r.id = r.name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .slice(0, 20);
    if (!r.createdAt) r.createdAt = new Date().toISOString();
    data[r.id] = r;
    this.save(data);
    return r;
  }

  delete(id: string): boolean {
    const data = this.load();
    if (!data[id]) return false;
    delete data[id];
    this.save(data);
    return true;
  }

  /**
   * Parse comment field from selling script to extract reseller name.
   * Format observed: "up-228-03.13.26-MOM" → "MOM" is the reseller/seller tag
   * Also handles plain reseller names as comment.
   */
  extractResellerTag(comment: string): string {
    if (!comment) return "(no comment)";
    // Format: up-NNN-DD.MM.YY-RESELLERNAME
    const match = comment.match(/^up-\d+-[\d.]+[-](.+)$/i);
    if (match) return match[1].toUpperCase();
    // Format: plain name
    return comment.toUpperCase();
  }
}
