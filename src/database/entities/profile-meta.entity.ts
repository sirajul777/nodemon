import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Local profile metadata for hotspot & PPPoE profiles.
 * Previously stored in data/profile-meta.json and data/pppoe-profile-meta.json.
 * Kind: 'hotspot' | 'pppoe'
 */
@Entity('profile_meta')
export class ProfileMetaEntity {
  @PrimaryColumn()
  id: string; // `${kind}:${sessionId}:${profileName}`

  @Index()
  @Column()
  kind: 'hotspot' | 'pppoe';

  @Index()
  @Column()
  sessionId: string;

  @Index()
  @Column()
  profileName: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ default: '' })
  validity: string;

  @Column({ nullable: true })
  profileColor: string;

  @Column({ nullable: true })
  caption: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
