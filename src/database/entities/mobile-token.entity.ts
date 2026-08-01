import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('mobile_user_tokens')
export class MobileTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  userId: string;

  @Column()
  username: string;

  @Column()
  name: string;

  @Column()
  role: string;

  @Column({ type: 'simple-json', nullable: true })
  permissions: any;

  @Column({ nullable: true })
  sessionId: string;

  @CreateDateColumn()
  createdAt: string;

  @Column()
  expiresAt: string;

  @Column()
  lastUsed: string;
}
