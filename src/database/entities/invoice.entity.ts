import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue' | 'cancelled';

@Entity('invoices')
export class InvoiceEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  customerId: string;

  @Column()
  customerName: string;

  @Index()
  @Column()
  sessionId: string;

  @Column()
  type: string;

  @Column()
  mikrotikUser: string;

  @Column({ default: '' })
  profile: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column()
  period: string;

  @Column()
  dueDate: string;

  @Column({ default: 'unpaid' })
  status: InvoiceStatus;

  @Column({ nullable: true })
  paidAt: string;

  @Column({ nullable: true })
  paidBy: string;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: string;

  @Column({ type: 'simple-json', nullable: true })
  reminderSent: string[];
}
