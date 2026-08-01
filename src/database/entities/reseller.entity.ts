import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('resellers')
export class ResellerEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'real', default: 0 })
  discount: number;

  @Column()
  createdAt: string;

  @Column({ nullable: true })
  router: string;
}

