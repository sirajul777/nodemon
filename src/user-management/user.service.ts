import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { UserEntity, UserRole, UserPermissions } from "../database/entities/user.entity";

export type { UserRole };

export interface AppUser {
  id: string;
  username: string;
  password: string; // encrypted
  name: string;
  role: UserRole;
  active: boolean;
  allowedSessions: string[]; // router sessions accessible (empty = all)
  permissions: UserPermissions;
  createdAt: string;
  lastLogin?: string;
  note?: string;
}

// Default permissions per role
const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: {
    viewDashboard: true,
    manageVoucher: true,
    manageBilling: true,
    manageReseller: true,
    managePppoe: true,
    manageHotspot: true,
    viewReport: true,
    manageSystem: true
  },
  reseller: {
    viewDashboard: true,
    manageVoucher: true,
    manageBilling: false,
    manageReseller: false,
    managePppoe: false,
    manageHotspot: false,
    viewReport: true,
    manageSystem: false
  },
  collector: {
    viewDashboard: true,
    manageVoucher: false,
    manageBilling: true,
    manageReseller: false,
    managePppoe: false,
    manageHotspot: false,
    viewReport: true,
    manageSystem: false
  }
};

@Injectable()
export class UserService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async comparePassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async toSafe(u: UserEntity): Promise<Omit<AppUser, "password">> {
    const { password, ...safe } = u;
    return safe as Omit<AppUser, "password">;
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async getAll(): Promise<Omit<AppUser, "password">[]> {
    const users = await this.userRepo.find();
    const result = [];
    for (const u of users) {
      result.push(await this.toSafe(u));
    }
    return result;
  }

  async getById(id: string): Promise<AppUser | null> {
    return (await this.userRepo.findOne({ where: { id } })) || null;
  }

  async getByUsername(username: string): Promise<AppUser | null> {
    return (await this.userRepo.findOne({ where: { username } })) || null;
  }

  async create(data: {
    username: string;
    password: string;
    name: string;
    role: UserRole;
    allowedSessions?: string[];
    permissions?: Partial<UserPermissions>;
    note?: string;
  }): Promise<Omit<AppUser, "password">> {
    const existing = await this.userRepo.findOne({ where: { username: data.username } });
    if (existing) {
      throw new Error(`Username "${data.username}" sudah digunakan`);
    }
    const defaultPerms =
      ROLE_PERMISSIONS[data.role] || ROLE_PERMISSIONS.reseller;
    const user = this.userRepo.create({
      id: `USR-${Date.now()}`,
      username: data.username,
      password: await this.hashPassword(data.password),
      name: data.name,
      role: data.role,
      active: true,
      allowedSessions: data.allowedSessions || [],
      permissions: { ...defaultPerms, ...(data.permissions || {}) },
      note: data.note || ""
    });
    const saved = await this.userRepo.save(user);
    return this.toSafe(saved);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      role: UserRole;
      active: boolean;
      allowedSessions: string[];
      permissions: Partial<UserPermissions>;
      note: string;
    }>
  ): Promise<Omit<AppUser, "password"> | null> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) return null;
    if (data.name !== undefined) u.name = data.name;
    if (data.role !== undefined) {
      u.role = data.role;
      // Reset to role defaults then apply overrides
      u.permissions = {
        ...ROLE_PERMISSIONS[data.role],
        ...(data.permissions || {})
      };
    } else if (data.permissions !== undefined) {
      u.permissions = { ...u.permissions, ...data.permissions };
    }
    if (data.active !== undefined) u.active = data.active;
    if (data.allowedSessions !== undefined)
      u.allowedSessions = data.allowedSessions;
    if (data.note !== undefined) u.note = data.note;
    const saved = await this.userRepo.save(u);
    return this.toSafe(saved);
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) return false;

    const isMatch = await this.comparePassword(oldPassword, u.password);
    if (!isMatch) return false;

    u.password = await this.hashPassword(newPassword);
    await this.userRepo.save(u);
    return true;
  }

  async resetPassword(id: string, newPassword: string): Promise<boolean> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) return false;
    u.password = await this.hashPassword(newPassword);
    await this.userRepo.save(u);
    return true;
  }

  async delete(id: string): Promise<boolean> {
    // Prevent deleting last admin
    const admins = await this.userRepo.find({ where: { role: "admin" } });
    const target = await this.userRepo.findOne({ where: { id } });
    if (target?.role === "admin" && admins.length <= 1) {
      throw new Error("Tidak bisa menghapus admin terakhir");
    }
    const result = await this.userRepo.delete({ id });
    return (result.affected || 0) > 0;
  }

  async toggleActive(id: string): Promise<boolean | null> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) return null;
    // Prevent deactivating last admin
    if (u.role === "admin" && u.active) {
      const activeAdmins = await this.userRepo.find({
        where: { role: "admin", active: true }
      });
      if (activeAdmins.length <= 1)
        throw new Error("Tidak bisa menonaktifkan admin terakhir");
    }
    u.active = !u.active;
    await this.userRepo.save(u);
    return u.active;
  }

  // ── Auth ───────────────────────────────────────────────────────────

  async validate(
    username: string,
    password: string
  ): Promise<Omit<AppUser, "password"> | null> {
    const u = await this.userRepo.findOne({ where: { username, active: true } });
    if (!u) return null;

    const isMatch = await this.comparePassword(password, u.password);
    if (!isMatch) return null;

    // Update lastLogin
    u.lastLogin = new Date().toISOString();
    await this.userRepo.save(u);
    return this.toSafe(u);
  }

  async updateLastLogin(id: string): Promise<void> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (u) {
      u.lastLogin = new Date().toISOString();
      await this.userRepo.save(u);
    }
  }

  getRoleDefaults(role: UserRole): UserPermissions {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.reseller;
  }
}

