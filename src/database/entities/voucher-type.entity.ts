import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('voucher_types')
export class VoucherTypeEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column()
  profile: string;

  @Column({ default: '' })
  duration: string;

  @Column({ type: 'int', default: 6 })
  codeLength: number;

  @Column({ default: 'upper+digit' })
  codeFormat: string;

  @Column({ type: 'int', default: 10 })
  maxPerOrder: number;

  @Column({ default: 'up' })
  userType: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: string;
}
