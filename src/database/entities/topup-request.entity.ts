import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('topup_requests')
export class TopupRequestEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  resellerId: string;

  @Column()
  resellerName: string;

  @Column()
  telegramId: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ default: '' })
  note: string;

  @CreateDateColumn()
  requestedAt: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';
}
