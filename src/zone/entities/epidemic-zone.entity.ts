import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Point } from 'geojson';

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ZoneLifecycleStatus {
  PROPOSED = 'proposed',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CLOSED = 'closed',
}

export enum ZoneSource {
  MANUAL = 'manual',
  DBSCAN = 'dbscan',
}

@Entity('epidemic_zones')
export class EpidemicZone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  diseaseType: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  diseaseId: string | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  @Index({ spatial: true })
  center: Point;

  @Column('float')
  radiusKm: number;

  @Column({
    type: 'enum',
    enum: RiskLevel,
    default: RiskLevel.LOW,
  })
  riskLevel: RiskLevel;

  @Column({ default: 0 })
  caseCount: number;

  @Column('text', { nullable: true })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: ZoneLifecycleStatus,
    default: ZoneLifecycleStatus.APPROVED,
  })
  lifecycleStatus: ZoneLifecycleStatus;

  @Column({
    type: 'enum',
    enum: ZoneSource,
    default: ZoneSource.MANUAL,
  })
  source: ZoneSource;

  @Column('float', { nullable: true })
  proposalConfidence: number | null;

  @Column('jsonb', { nullable: true })
  proposalMetadata: Record<string, any> | null;

  @Column({ type: 'timestamptz', nullable: true })
  proposedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  proposedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @Column('text', { nullable: true })
  reviewNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual properties
  get latitude(): number {
    return this.center?.coordinates?.[1];
  }

  get longitude(): number {
    return this.center?.coordinates?.[0];
  }
}
