import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('settlements')
export class SettlementEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  collectorId: string;

  @Column()
  collectorName: string;

  @Index()
  @Column()
  sessionId: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ default: 'pending' })
  status: 'pending' | 'verified';

  @CreateDateColumn()
  createdAt: string;

  @Column({ nullable: true })
  verifiedAt: string;
}
