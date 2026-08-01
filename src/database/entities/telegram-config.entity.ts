import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('telegram_configs')
export class TelegramConfigEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  token: string;

  @Column()
  chatId: string;

  @Index()
  @Column()
  sessionId: string;

  @Column({ type: 'boolean', default: true })
  notifSale: boolean;

  @Column({ type: 'boolean', default: false })
  notifDaily: boolean;

  @Column({ default: '23:59' })
  dailyTime: string;

  @Column({ type: 'boolean', default: true })
  botEnabled: boolean;

  @Column({ type: 'simple-json', nullable: true })
  allowedUsers: string[];

  @Column({ default: '' })
  defaultProfile: string;

  @Column({ default: '' })
  welcomeMsg: string;
}
