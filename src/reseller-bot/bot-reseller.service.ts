import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotResellerEntity } from '../database/entities/bot-reseller.entity';
import { TopupLogEntity } from '../database/entities/topup-log.entity';

export interface BotReseller {
  id: string;             // unique ID
  name: string;           // display name
  username?: string;      // telegram @username
  telegramId: string;
  sessionId: string;      // telegram user ID (numeric string)
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
  id?: number;
  reselerId: string;
  amount: number;
  type: 'topup' | 'deduct' | 'purchase';
  note: string;
  by: string;
  at: string;
  balanceBefore: number;
  balanceAfter: number;
}

@Injectable()
export class BotResellerService {
  constructor(
    @InjectRepository(BotResellerEntity)
    private readonly resellerRepo: Repository<BotResellerEntity>,
    @InjectRepository(TopupLogEntity)
    private readonly logRepo: Repository<TopupLogEntity>
  ) {}

  private async toModel(e: BotResellerEntity): Promise<BotReseller> {
    return {
      id: e.id,
      name: e.name,
      username: e.username || '',
      telegramId: e.telegramId,
      sessionId: e.sessionId || '',
      saldo: e.saldo || 0,
      totalVoucher: e.totalVoucher || 0,
      totalIncome: e.totalIncome || 0,
      status: e.status,
      markup: e.markup || 0,
      discount: e.discount || 0,
      createdAt: e.createdAt,
      lastActive: e.lastActive || '',
      note: e.note || ''
    };
  }

  // ── Reseller CRUD ──────────────────────────────────────────────

  async loadAll(): Promise<BotReseller[]> {
    const rows = await this.resellerRepo.find();
    const result = [];
    for (const r of rows) result.push(await this.toModel(r));
    return result;
  }

  async getById(id: string): Promise<BotReseller | null> {
    const e = await this.resellerRepo.findOne({ where: { id } });
    return e ? this.toModel(e) : null;
  }

  async getByTelegramId(telegramId: string): Promise<BotReseller | null> {
    const e = await this.resellerRepo.findOne({ where: { telegramId } });
    return e ? this.toModel(e) : null;
  }

  async upsert(data: Partial<BotReseller> & { name: string; telegramId: string }): Promise<BotReseller> {
    const id = data.id || `RS-${Date.now()}`;
    let entity = await this.resellerRepo.findOne({ where: { id } });

    if (!entity) {
      entity = this.resellerRepo.create({
        id,
        name: data.name,
        username: data.username || '',
        telegramId: data.telegramId,
        sessionId: data.sessionId || '',
        saldo: data.saldo ?? 0,
        totalVoucher: data.totalVoucher ?? 0,
        totalIncome: data.totalIncome ?? 0,
        status: data.status ?? 'active',
        markup: data.markup ?? 0,
        discount: data.discount ?? 0,
        lastActive: data.lastActive,
        note: data.note || ''
      });
    } else {
      if (data.name !== undefined) entity.name = data.name;
      if (data.username !== undefined) entity.username = data.username;
      if (data.telegramId !== undefined) entity.telegramId = data.telegramId;
      if (data.sessionId !== undefined) entity.sessionId = data.sessionId;
      if (data.saldo !== undefined) entity.saldo = data.saldo;
      if (data.totalVoucher !== undefined) entity.totalVoucher = data.totalVoucher;
      if (data.totalIncome !== undefined) entity.totalIncome = data.totalIncome;
      if (data.status !== undefined) entity.status = data.status;
      if (data.markup !== undefined) entity.markup = data.markup;
      if (data.discount !== undefined) entity.discount = data.discount;
      if (data.lastActive !== undefined) entity.lastActive = data.lastActive;
      if (data.note !== undefined) entity.note = data.note;
    }
    const saved = await this.resellerRepo.save(entity);
    return this.toModel(saved);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.resellerRepo.delete({ id });
    return (result.affected || 0) > 0;
  }

  async toggleStatus(id: string): Promise<BotReseller | null> {
    const entity = await this.resellerRepo.findOne({ where: { id } });
    if (!entity) return null;
    entity.status = entity.status === 'active' ? 'inactive' : 'active';
    const saved = await this.resellerRepo.save(entity);
    return this.toModel(saved);
  }

  // ── Balance (Saldo) ────────────────────────────────────────────

  async topup(id: string, amount: number, note: string, by: string): Promise<{ reseller: BotReseller; log: TopupLog } | null> {
    const entity = await this.resellerRepo.findOne({ where: { id } });
    if (!entity) return null;

    const balanceBefore = entity.saldo || 0;
    entity.saldo = balanceBefore + amount;
    await this.resellerRepo.save(entity);

    const log: TopupLog = {
      reselerId: id,
      amount,
      type: amount >= 0 ? 'topup' : 'deduct',
      note,
      by,
      at: new Date().toISOString(),
      balanceBefore,
      balanceAfter: entity.saldo,
    };
    await this.addLog(log);
    return { reseller: await this.toModel(entity), log };
  }

  async deductSaldo(telegramId: string, amount: number, note: string): Promise<boolean> {
    const entity = await this.resellerRepo.findOne({ where: { telegramId } });
    if (!entity || (entity.saldo || 0) < amount) return false;
    const balanceBefore = entity.saldo || 0;
    entity.saldo = balanceBefore - amount;
    entity.totalVoucher = (entity.totalVoucher || 0) + 1;
    entity.totalIncome = (entity.totalIncome || 0) + amount;
    entity.lastActive = new Date().toISOString();
    await this.resellerRepo.save(entity);
    await this.addLog({
      reselerId: entity.id,
      amount: -amount,
      type: 'purchase',
      note,
      by: 'bot',
      at: new Date().toISOString(),
      balanceBefore: balanceBefore,
      balanceAfter: entity.saldo,
    });
    return true;
  }

  // ── Topup Log ──────────────────────────────────────────────────

  async loadLogs(resellerId?: string): Promise<TopupLog[]> {
    const where = resellerId ? { reselerId: resellerId } : {};
    const rows = await this.logRepo.find({ where, order: { id: 'DESC' } });
    return rows.map(r => ({
      id: r.id,
      reselerId: r.reselerId,
      amount: r.amount || 0,
      type: r.type,
      note: r.note,
      by: r.by,
      at: r.at,
      balanceBefore: r.balanceBefore || 0,
      balanceAfter: r.balanceAfter || 0
    }));
  }

  private async addLog(log: TopupLog) {
    const entity = this.logRepo.create({
      reselerId: log.reselerId,
      amount: log.amount,
      type: log.type,
      note: log.note,
      by: log.by,
      at: log.at,
      balanceBefore: log.balanceBefore,
      balanceAfter: log.balanceAfter
    });
    await this.logRepo.save(entity);
  }
}

