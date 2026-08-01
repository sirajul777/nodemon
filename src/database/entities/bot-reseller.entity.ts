import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('bot_resellers')
export class BotResellerEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  username: string;

  @Index()
  @Column()
  telegramId: string;

  @Column({ nullable: true })
  sessionId: string;

  @Column({ type: 'real', default: 0 })
  saldo: number;

  @Column({ type: 'int', default: 0 })
  totalVoucher: number;

  @Column({ type: 'int', default: 0 })
  totalIncome: number;

  @Column({ default: 'active' })
  status: 'active' | 'inactive';

  @Column({ type: 'real', default: 0 })
  markup: number;

  @Column({ type: 'real', default: 0 })
  discount: number;

  @CreateDateColumn()
  createdAt: string;

  @Column({ nullable: true })
  lastActive: string;

  @Column({ nullable: true })
  note: string;
}
