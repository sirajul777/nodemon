import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Singleton row for the app-wide admin configuration
 * (legacy single-admin credentials from data/config.json).
 */
@Entity('app_config')
export class AppConfigEntity {
  @PrimaryColumn({ default: 'default' })
  key: string;

  @Column({ default: 'mikhmon' })
  adminUser: string;

  @Column()
  adminPass: string;

  @Column({ default: 'Rp' })
  currency: string;
}

