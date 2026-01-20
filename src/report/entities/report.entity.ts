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
import { Point } from 'geojson';
import { User } from '../../auth/entities/user.entity';

export enum ReportStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  RESOLVED = 'resolved',
}

export interface PatientInfo {
  fullName?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  idNumber?: string;
  phone?: string;
  address?: string;
  occupation?: string;
  workplace?: string;
  symptomOnsetDate?: string;
  healthFacility?: string;
  isHospitalized?: boolean;
  travelHistory?: string;
  contactHistory?: string;
  underlyingConditions?: string[];
}

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  diseaseType: string;

  @Column('text')
  description: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  @Index({ spatial: true })
  location: Point;

  @Column({ nullable: true })
  address: string;

  // Reporter's location when submitting the report
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  reporterLocation: Point;

  @Column('simple-array', { nullable: true })
  symptoms: string[];

  @Column({ default: 1 })
  affectedCount: number;

  @Column('simple-array', { nullable: true })
  imageUrls: string[];

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.PENDING,
  })
  status: ReportStatus;

  @Column({ nullable: true })
  adminNote?: string;

  @Column({ nullable: true })
  verifiedAt: Date;

  @Column({ nullable: true })
  verifiedBy: string;

  // Detailed case report fields
  @Column({ default: false })
  isDetailedReport: boolean;

  @Column('jsonb', { nullable: true })
  patientInfo: PatientInfo;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual properties for coordinates
  get latitude(): number {
    return this.location?.coordinates?.[1];
  }

  get longitude(): number {
    return this.location?.coordinates?.[0];
  }
}
