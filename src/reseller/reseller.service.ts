import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResellerEntity } from "../database/entities/reseller.entity";

export interface Reseller {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  discount: number; // percent discount from base price
  createdAt: string;
  router?: string;
}

@Injectable()
export class ResellerService {
  constructor(
    @InjectRepository(ResellerEntity)
    private readonly resellerRepo: Repository<ResellerEntity>
  ) {}

  private async toModel(e: ResellerEntity): Promise<Reseller> {
    return {
      id: e.id,
      name: e.name,
      phone: e.phone || "",
      address: e.address || "",
      discount: e.discount || 0,
      createdAt: e.createdAt,
      router: e.router || ""
    };
  }

  async getAll(sessionId: string): Promise<Reseller[]> {
    const list = await this.resellerRepo.find({ where: { router: sessionId } });
    const result = [];
    for (const r of list) result.push(await this.toModel(r));
    return result;
  }

  async getById(id: string): Promise<Reseller | null> {
    const e = await this.resellerRepo.findOne({ where: { id } });
    return e ? this.toModel(e) : null;
  }

  async save_reseller(r: Reseller): Promise<Reseller> {
    let id = r.id;
    if (!id)
      id = r.name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .slice(0, 20);
    if (!r.createdAt) r.createdAt = new Date().toISOString();

    let entity = await this.resellerRepo.findOne({ where: { id } });
    if (!entity) {
      entity = this.resellerRepo.create({
        id,
        name: r.name,
        phone: r.phone || "",
        address: r.address || "",
        discount: r.discount || 0,
        createdAt: r.createdAt,
        router: r.router || ""
      });
    } else {
      entity.name = r.name;
      entity.phone = r.phone || "";
      entity.address = r.address || "";
      entity.discount = r.discount || 0;
      entity.router = r.router || "";
    }
    await this.resellerRepo.save(entity);
    return this.toModel(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.resellerRepo.delete({ id });
    return (result.affected || 0) > 0;
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

