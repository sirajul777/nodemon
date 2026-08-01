import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { VoucherTypeEntity } from "../database/entities/voucher-type.entity";

export interface VoucherType {
  id: string;
  name: string; // Display name e.g. "VOCER 1K"
  price: number; // Selling price
  profile: string; // MikroTik hotspot profile name
  duration: string; // e.g. "4j", "1 hari", "30 hari"
  codeLength: number; // Username/password length
  codeFormat: string; // "upper+digit" | "lower+digit" | "mixed+digit"
  maxPerOrder: number; // Max vouchers per /generate command
  userType: string;
  active: boolean;
  createdAt: string;
}

@Injectable()
export class VoucherTypeService {
  constructor(
    @InjectRepository(VoucherTypeEntity)
    private readonly vtRepo: Repository<VoucherTypeEntity>
  ) {}

  private async toModel(e: VoucherTypeEntity): Promise<VoucherType> {
    return {
      id: e.id,
      name: e.name,
      price: e.price || 0,
      profile: e.profile,
      duration: e.duration || "",
      codeLength: e.codeLength || 6,
      codeFormat: e.codeFormat || "upper+digit",
      maxPerOrder: e.maxPerOrder || 10,
      userType: e.userType || "up",
      active: e.active !== false,
      createdAt: e.createdAt
    };
  }

  async getAll(): Promise<VoucherType[]> {
    const rows = await this.vtRepo.find();
    const result = [];
    for (const r of rows) result.push(await this.toModel(r));
    return result.sort((a, b) => a.price - b.price);
  }

  async getActive(): Promise<VoucherType[]> {
    const all = await this.getAll();
    return all.filter((v) => v.active);
  }

  async getById(id: string): Promise<VoucherType | null> {
    const e = await this.vtRepo.findOne({ where: { id } });
    return e ? this.toModel(e) : null;
  }

  async upsert(
    data: Partial<VoucherType> & {
      name: string;
      profile: string;
      price: number;
      userType: string;
    }
  ): Promise<VoucherType> {
    const id = data.id || `vt_${Date.now()}`;
    let entity = await this.vtRepo.findOne({ where: { id } });

    if (!entity) {
      entity = this.vtRepo.create({
        id,
        name: data.name,
        price: Number(data.price) || 0,
        profile: data.profile,
        duration: data.duration || "",
        codeLength: Number(data.codeLength) || 6,
        codeFormat: data.codeFormat || "upper+digit",
        maxPerOrder: Number(data.maxPerOrder) || 10,
        userType: data.userType || "up",
        active: data.active !== false,
        createdAt: data.createdAt || new Date().toISOString()
      });
    } else {
      if (data.name !== undefined) entity.name = data.name;
      if (data.price !== undefined) entity.price = Number(data.price) || 0;
      if (data.profile !== undefined) entity.profile = data.profile;
      if (data.duration !== undefined) entity.duration = data.duration;
      if (data.codeLength !== undefined)
        entity.codeLength = Number(data.codeLength) || 6;
      if (data.codeFormat !== undefined) entity.codeFormat = data.codeFormat;
      if (data.maxPerOrder !== undefined)
        entity.maxPerOrder = Number(data.maxPerOrder) || 10;
      if (data.userType !== undefined) entity.userType = data.userType;
      if (data.active !== undefined) entity.active = data.active;
    }
    const saved = await this.vtRepo.save(entity);
    return this.toModel(saved);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.vtRepo.delete({ id });
    return (result.affected || 0) > 0;
  }

  async toggleActive(id: string): Promise<VoucherType | null> {
    const entity = await this.vtRepo.findOne({ where: { id } });
    if (!entity) return null;
    entity.active = !entity.active;
    const saved = await this.vtRepo.save(entity);
    return this.toModel(saved);
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
      case "upper+digit":
        chars = "ABCDEFGHJKMNPRSTUVWXYZ23456789";
        break;
      case "lower+digit":
        chars = "abcdefghjkmnprstuvwxyz23456789";
        break;
      case "mixed+digit":
        chars = "abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ23456789";
        break;
      case "digit":
        chars = "2345678901";
        break;
      default:
        chars = "ABCDEFGHJKMNPRSTUVWXYZ23456789";
    }
    return Array.from(
      { length: vt.codeLength },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  }
}

