import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export interface VoucherItemEntity {
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

@Entity('voucher_batches')
export class VoucherBatchEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  sessionId: string;

  @Column()
  profileName: string;

  @Column({ default: '#1f6feb' })
  profileColor: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ type: 'int', default: 0 })
  totalPrice: number;

  @Column({ default: '' })
  validity: string;

  @Column({ nullable: true })
  caption: string;

  @Column({ default: '' })
  nasName: string;

  @Column({ default: '' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: string;

  @Column({ nullable: true })
  resellerId: string;

  @Column({ nullable: true })
  resellerName: string;

  @Column({ type: 'simple-json' })
  vouchers: VoucherItemEntity[];
}
