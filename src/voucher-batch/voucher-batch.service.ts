import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoucherBatchEntity, VoucherItemEntity } from '../database/entities/voucher-batch.entity';
import { ProfileMetaService } from '../database/profile-meta.service';

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

@Injectable()
export class VoucherBatchService {
  constructor(
    @InjectRepository(VoucherBatchEntity)
    private readonly batchRepo: Repository<VoucherBatchEntity>,
    private readonly profileMetaSvc: ProfileMetaService
  ) {}

  private async toModel(e: VoucherBatchEntity): Promise<VoucherBatch> {
    return {
      id: e.id,
      profileName: e.profileName,
      profileColor: e.profileColor || '#1f6feb',
      price: e.price || 0,
      totalPrice: e.totalPrice || 0,
      validity: e.validity || '',
      caption: e.caption || '',
      sessionId: e.sessionId,
      nasName: e.nasName || '',
      createdBy: e.createdBy || '',
      createdAt: e.createdAt,
      resellerId: e.resellerId || '',
      resellerName: e.resellerName || '',
      vouchers: e.vouchers || []
    };
  }

  async loadAll(sessionId: string): Promise<VoucherBatch[]> {
    const rows = await this.batchRepo.find({ where: { sessionId } });
    const result = [];
    for (const r of rows) result.push(await this.toModel(r));
    return result;
  }

  async getById(sessionId: string, batchId: string): Promise<VoucherBatch | null> {
    const e = await this.batchRepo.findOne({ where: { id: batchId, sessionId } });
    return e ? this.toModel(e) : null;
  }

  async saveBatch(batch: VoucherBatch): Promise<VoucherBatch> {
    let entity = await this.batchRepo.findOne({ where: { id: batch.id, sessionId: batch.sessionId } });
    if (!entity) {
      entity = this.batchRepo.create({
        id: batch.id,
        sessionId: batch.sessionId,
        profileName: batch.profileName,
        profileColor: batch.profileColor || '#1f6feb',
        price: batch.price || 0,
        totalPrice: batch.totalPrice || 0,
        validity: batch.validity || '',
        caption: batch.caption || '',
        nasName: batch.nasName || '',
        createdBy: batch.createdBy || '',
        createdAt: batch.createdAt || new Date().toISOString(),
        resellerId: batch.resellerId || '',
        resellerName: batch.resellerName || '',
        vouchers: batch.vouchers || []
      });
    } else {
      entity.profileName = batch.profileName;
      entity.profileColor = batch.profileColor || '#1f6feb';
      entity.price = batch.price || 0;
      entity.totalPrice = batch.totalPrice || 0;
      entity.validity = batch.validity || '';
      entity.caption = batch.caption || '';
      entity.nasName = batch.nasName || '';
      entity.createdBy = batch.createdBy || '';
      entity.resellerId = batch.resellerId || '';
      entity.resellerName = batch.resellerName || '';
      entity.vouchers = batch.vouchers || [];
    }
    const saved = await this.batchRepo.save(entity);
    return this.toModel(saved);
  }

  async deleteBatch(sessionId: string, batchId: string): Promise<boolean> {
    const result = await this.batchRepo.delete({ id: batchId, sessionId });
    return (result.affected || 0) > 0;
  }

  async markUsed(sessionId: string, batchId: string, username: string, usedBy: string): Promise<boolean> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId, sessionId } });
    if (!batch) return false;
    const vcr = (batch.vouchers || []).find(v => v.username === username);
    if (!vcr) return false;
    vcr.status = 'used';
    vcr.usedBy = usedBy;
    vcr.usedAt = new Date().toLocaleString('id-ID');
    await this.batchRepo.save(batch);
    return true;
  }

  getStats(batch: VoucherBatch) {
    const used = batch.vouchers.filter(v => v.status === 'used').length;
    const total = batch.vouchers.length;
    return { total, used, remaining: total - used, usedPct: Math.round(used / total * 100) };
  }

  async readLocalProfileMeta(sessionId: string): Promise<Record<string, { profileColor?: string; caption?: string }>> {
    const all = await this.profileMetaSvc.getAllForSession('hotspot', sessionId);
    const result: Record<string, { profileColor?: string; caption?: string }> = {};
    for (const [name, meta] of Object.entries(all)) {
      result[name] = {
        profileColor: meta.profileColor,
        caption: meta.caption
      };
    }
    return result;
  }
}

