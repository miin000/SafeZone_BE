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

// Full workflow statuses matching WHO 4-layer confirmation process
export enum ReportStatus {
  SUBMITTED = 'submitted', // Người dân vừa gửi
  AUTO_VERIFIED = 'auto_verified', // Hệ thống xác nhận tự động
  UNDER_REVIEW = 'under_review', // Nhân viên y tế đang xem
  FIELD_VERIFICATION = 'field_verification', // Đang kiểm tra thực địa
  CONFIRMED = 'confirmed', // Xác nhận ca bệnh
  REJECTED = 'rejected', // Không hợp lệ
  CLOSED = 'closed', // Hoàn tất xử lý
  // Keep old statuses for backward compatibility
  PENDING = 'pending',
  VERIFIED = 'verified',
  RESOLVED = 'resolved',
}

export type ReportType = 'case_report' | 'outbreak_alert';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type PreliminaryResult = 'valid' | 'need_field_check' | 'invalid';
export type FieldVerificationResult = 'confirmed_suspected' | 'not_disease';
export type OfficialClassification =
  | 'suspected'
  | 'probable'
  | 'confirmed'
  | 'false_alarm';
export type ClosureAction =
  | 'monitoring'
  | 'isolation'
  | 'area_warning'
  | 'no_action';
export type LocationType =
  | 'school'
  | 'factory'
  | 'residential'
  | 'market'
  | 'hospital'
  | 'other';

export interface PatientInfo {
  fullName?: string;
  age?: number;
  yearOfBirth?: number;
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

export interface AutoVerificationResult {
  phoneVerified: boolean;
  gpsValid: boolean;
  duplicateCheck: boolean;
  riskLevel: SeverityLevel;
  timestamp: string;
}

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Report type: case_report or outbreak_alert
  @Column({ default: 'case_report' })
  reportType: ReportType;

  @Column()
  diseaseType: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  diseaseId: string | null;

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
    default: ReportStatus.SUBMITTED,
  })
  status: ReportStatus;

  // Severity / urgency
  @Column({ default: 'medium' })
  severityLevel: SeverityLevel;

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

  // Reporter info (stored for traceability)
  @Column({ nullable: true })
  reporterName: string;

  @Column({ nullable: true })
  reporterPhone: string;

  // Patient relation
  @Column({ default: true })
  isSelfReport: boolean;

  // Patient query columns
  @Column({ nullable: true })
  patientGender: string;

  @Column({ nullable: true })
  patientYearOfBirth: number;

  @Column({ nullable: true })
  patientPhone: string;

  @Column({ type: 'timestamp', nullable: true })
  symptomOnsetDate: Date;

  // Epidemiological info
  @Column({ nullable: true })
  hasContactWithPatient: boolean;

  @Column({ nullable: true })
  hasVisitedEpidemicArea: boolean;

  @Column({ nullable: true })
  hasSimilarCasesNearby: boolean;

  @Column({ nullable: true })
  estimatedNearbyCount: number;

  // Medical visit
  @Column({ nullable: true })
  hasVisitedDoctor: boolean;

  @Column({ nullable: true })
  hasTestResult: boolean;

  @Column({ type: 'text', nullable: true })
  testResultDescription: string;

  // Evidence URLs
  @Column('simple-array', { nullable: true })
  testResultImageUrls: string[];

  @Column('simple-array', { nullable: true })
  medicalCertImageUrls: string[];

  // Outbreak-specific fields
  @Column({ type: 'text', nullable: true })
  locationDescription: string;

  @Column({ nullable: true })
  locationType: LocationType;

  @Column({ nullable: true })
  suspectedDisease: string;

  @Column({ type: 'text', nullable: true })
  outbreakDescription: string;

  @Column({ type: 'timestamp', nullable: true })
  discoveryTime: Date;

  // ==================== MULTI-STEP VERIFICATION ====================

  // Step 1: Auto verification
  @Column({ type: 'timestamp', nullable: true })
  autoVerifiedAt: Date;

  @Column('jsonb', { nullable: true })
  autoVerificationResult: AutoVerificationResult;

  // Step 2: Preliminary review by local health station
  @Column({ nullable: true })
  preliminaryReviewBy: string;

  @Column({ type: 'timestamp', nullable: true })
  preliminaryReviewAt: Date;

  @Column({ type: 'text', nullable: true })
  preliminaryReviewNote: string;

  @Column({ nullable: true })
  preliminaryReviewResult: PreliminaryResult;

  // Step 3: Field verification
  @Column({ nullable: true })
  fieldVerifierId: string;

  @Column({ type: 'timestamp', nullable: true })
  fieldVerifiedAt: Date;

  @Column({ type: 'text', nullable: true })
  fieldVerificationNote: string;

  @Column({ nullable: true })
  fieldVerificationResult: FieldVerificationResult;

  // Step 4: Official confirmation (CDC / Ministry)
  @Column({ nullable: true })
  officialConfirmBy: string;

  @Column({ type: 'timestamp', nullable: true })
  officialConfirmAt: Date;

  @Column({ type: 'text', nullable: true })
  officialConfirmNote: string;

  @Column({ nullable: true })
  officialClassification: OfficialClassification;

  // Closure
  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date;

  @Column({ nullable: true })
  closedBy: string;

  @Column({ type: 'text', nullable: true })
  closureNote: string;

  @Column({ nullable: true })
  closureAction: ClosureAction;

  // Consent
  @Column({ default: false })
  reporterConsent: boolean;

  // Device for spam prevention
  @Column({ nullable: true })
  deviceId: string;

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

// Status history entity for audit trail
@Entity('report_status_history')
export class ReportStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  reportId: string;

  @Column({ nullable: true })
  previousStatus: string;

  @Column()
  newStatus: string;

  @Column({ nullable: true })
  changedBy: string;

  @Column({ nullable: true })
  changedByRole: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
