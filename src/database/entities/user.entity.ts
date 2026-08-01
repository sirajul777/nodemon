import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type UserRole = 'admin' | 'reseller' | 'collector';

export interface UserPermissions {
  viewDashboard: boolean;
  manageVoucher: boolean;
  manageBilling: boolean;
  manageReseller: boolean;
  managePppoe: boolean;
  manageHotspot: boolean;
  viewReport: boolean;
  manageSystem: boolean;
}

@Entity('users')
export class UserEntity {
  @PrimaryColumn()
  id: string;

  @Index({ unique: true })
  @Column()
  username: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'reseller' })
  role: UserRole;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'simple-json', nullable: true })
  allowedSessions: string[];

  @Column({ type: 'simple-json', nullable: true })
  permissions: UserPermissions;

  @CreateDateColumn()
  createdAt: string;

  @Column({ nullable: true })
  lastLogin: string;

  @Column({ nullable: true })
  note: string;
}

