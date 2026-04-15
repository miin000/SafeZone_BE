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

export enum HealthInfoCategory {
  DISEASE_PREVENTION = 'disease_prevention',
  VACCINATION = 'vaccination',
  COMMUNITY_HEALTH = 'community_health',
  MEDICAL_GUIDANCE = 'medical_guidance',
  NEWS = 'news',
}

export enum HealthInfoStatus {
  DRAFT = 'draft',
  REVIEWED = 'reviewed',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum HealthInfoDiseaseType {
  DENGUE = 'dengue',
  COVID = 'covid',
  FLU = 'flu',
  GENERAL = 'general',
}

export enum HealthInfoTarget {
  GENERAL = 'general',
  CHILDREN = 'children',
  ELDERLY = 'elderly',
  PREGNANT = 'pregnant',
}

export enum HealthInfoSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EMERGENCY = 'emergency',
}

@Entity('health_info')
export class HealthInfo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column({ nullable: true })
  summary: string;

  @Column({ default: HealthInfoDiseaseType.GENERAL })
  @Index()
  diseaseType: HealthInfoDiseaseType;

  // Optional FK to diseases catalog (preferred for new clients)
  @Column({ type: 'uuid', nullable: true })
  @Index()
  diseaseId: string | null;

  @Column({ default: HealthInfoTarget.GENERAL })
  @Index()
  target: HealthInfoTarget;

  @Column({ default: HealthInfoSeverity.LOW })
  @Index()
  severityLevel: HealthInfoSeverity;

  @Column({
    type: 'enum',
    enum: HealthInfoCategory,
    default: HealthInfoCategory.NEWS,
  })
  @Index()
  category: HealthInfoCategory;

  @Column({
    type: 'enum',
    enum: HealthInfoStatus,
    default: HealthInfoStatus.DRAFT,
  })
  @Index()
  status: HealthInfoStatus;

  @Column({ nullable: true })
  thumbnailUrl: string;

  @Column('simple-array', { nullable: true })
  imageUrls: string[];

  @Column('simple-array', { nullable: true })
  tags: string[];

  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ nullable: true })
  sourceUrl: string;

  @Column({ nullable: true })
  sourceName: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: string;

  @Column({ nullable: true })
  publishedAt: Date;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
