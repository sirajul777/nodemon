import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileMetaEntity } from './entities/profile-meta.entity';

export interface ProfileMeta {
  price?: number;
  validity?: string;
  profileColor?: string;
  caption?: string;
  active?: boolean;
}

/**
 * Centralized DB-backed storage for per-router profile metadata
 * (hotspot & pppoe). Replaces direct reads/writes to
 * data/profile-meta.json and data/pppoe-profile-meta.json.
 */
@Injectable()
export class ProfileMetaService {
  constructor(
    @InjectRepository(ProfileMetaEntity)
    private readonly repo: Repository<ProfileMetaEntity>,
  ) {}

  private id(kind: 'hotspot' | 'pppoe', sessionId: string, profileName: string): string {
    return `${kind}:${sessionId}:${profileName}`;
  }

  /** Get a single profile's meta */
  async get(
    kind: 'hotspot' | 'pppoe',
    sessionId: string,
    profileName: string,
  ): Promise<ProfileMeta> {
    const row = await this.repo.findOne({
      where: { kind, sessionId, profileName },
    });
    if (!row) return {};
    return {
      price: row.price,
      validity: row.validity,
      profileColor: row.profileColor || undefined,
      caption: row.caption || undefined,
      active: row.active,
    };
  }

  /** Get all profile meta for a session (keyed by profile name) */
  async getAllForSession(
    kind: 'hotspot' | 'pppoe',
    sessionId: string,
  ): Promise<Record<string, ProfileMeta>> {
    const rows = await this.repo.find({ where: { kind, sessionId } });
    const result: Record<string, ProfileMeta> = {};
    for (const r of rows) {
      result[r.profileName] = {
        price: r.price,
        validity: r.validity,
        profileColor: r.profileColor || undefined,
        caption: r.caption || undefined,
        active: r.active,
      };
    }
    return result;
  }

  /** Upsert a single profile's meta */
  async set(
    kind: 'hotspot' | 'pppoe',
    sessionId: string,
    profileName: string,
    meta: ProfileMeta,
  ): Promise<void> {
    const id = this.id(kind, sessionId, profileName);
    let row = await this.repo.findOne({ where: { id } });
    if (!row) {
      row = this.repo.create({ id, kind, sessionId, profileName });
    }
    if (meta.price !== undefined) row.price = meta.price;
    if (meta.validity !== undefined) row.validity = meta.validity;
    if (meta.profileColor !== undefined) row.profileColor = meta.profileColor;
    if (meta.caption !== undefined) row.caption = meta.caption;
    if (meta.active !== undefined) row.active = meta.active;
    await this.repo.save(row);
  }

  /** Remove a profile's meta */
  async remove(kind: 'hotspot' | 'pppoe', sessionId: string, profileName: string): Promise<void> {
    await this.repo.delete({ kind, sessionId, profileName });
  }
}

