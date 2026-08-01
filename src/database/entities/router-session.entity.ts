import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('router_sessions')
export class RouterSessionEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  name: string;

  @Column()
  ip: string;

  @Column({ type: 'int', default: 8728 })
  port: number;

  @Column()
  user: string;

  @Column()
  password: string;

  @Column({ default: '' })
  hotspotName: string;

  @Column({ default: '' })
  dnsName: string;

  @Column({ default: 'Rp' })
  currency: string;

  @Column({ type: 'int', default: 10 })
  reloadInterval: number;

  @Column({ default: 'ether1' })
  iface: string;

  @Column({ type: 'int', default: 0 })
  idleTo: number;

  @Column({ default: 'enable' })
  livereport: string;
}

