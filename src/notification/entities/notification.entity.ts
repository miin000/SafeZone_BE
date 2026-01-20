import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum NotificationType {
  EPIDEMIC_ALERT = 'epidemic_alert',
  ZONE_ENTRY = 'zone_entry',
  REPORT_UPDATE = 'report_update',
  ZONE_UPDATE = 'zone_update',
  NEW_POST = 'new_post',
  SYSTEM = 'system',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  body: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  @Column('jsonb', { nullable: true })
  data: Record<string, any>;

  @Column({ default: false })
  isRead: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({ default: false })
  isBroadcast: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
