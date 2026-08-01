import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bot_topup_logs')
export class TopupLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reselerId: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column()
  type: 'topup' | 'deduct' | 'purchase';

  @Column()
  note: string;

  @Column()
  by: string;

  @Column()
  at: string;

  @Column({ type: 'int', default: 0 })
  balanceBefore: number;

  @Column({ type: 'int', default: 0 })
  balanceAfter: number;
}
