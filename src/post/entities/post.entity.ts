import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum PostStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @Column('simple-array', { nullable: true })
  imageUrls: string[];

  @Column({
    type: 'enum',
    enum: PostStatus,
    default: PostStatus.PENDING,
  })
  @Index()
  status: PostStatus;

  @Column({ default: 0 })
  helpfulCount: number;

  @Column({ default: 0 })
  notHelpfulCount: number;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  diseaseType: string;

  @Column({ nullable: true })
  adminNote: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
