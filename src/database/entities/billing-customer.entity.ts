import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type BillingType = 'hotspot' | 'pppoe';
export type BillingStatus = 'active' | 'suspended' | 'expired' | 'unpaid';

@Entity('billing_customers')
export class BillingCustomerEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  telegramId: string;

  @Column({ nullable: true })
  address: string;

  @Column({ default: 'pppoe' })
  type: BillingType;

  @Index()
  @Column()
  mikrotikUser: string;

  @Index()
  @Column()
  sessionId: string;

  @Column({ default: '' })
  profile: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ type: 'int', default: 1 })
  billDate: number;

  @Column({ default: 'active' })
  status: BillingStatus;

  @Column({ type: 'real', nullable: true })
  unsettledCash: number;

  @Column({ type: 'boolean', default: true })
  autoDisable: boolean;

  @Column({ type: 'int', default: 3 })
  graceDays: number;

  @Column({ type: 'simple-json', nullable: true })
  reminderDays: number[];

  @CreateDateColumn()
  createdAt: string;

  @Column({ nullable: true })
  note: string;
}
