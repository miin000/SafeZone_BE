import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  HEALTH_AUTHORITY = 'health_authority',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column()
  password?: string;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  // Enhanced personal info
  @Column({ nullable: true })
  gender: string; // male, female, other

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  citizenId: string; // CCCD

  // Address fields
  @Column({ type: 'text', nullable: true })
  fullAddress: string;

  @Column({ nullable: true })
  province: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  ward: string;

  // Organization info (for health_authority)
  @Column({ nullable: true })
  organizationName: string;

  @Column({ nullable: true })
  organizationLevel: string; // commune, district, province, central

  @Column({ type: 'text', nullable: true })
  organizationAddress: string;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  emailOtp: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailOtpExpires: Date | null;

  @Column({ type: 'varchar', nullable: true })
  phoneOtp: string | null;

  @Column({ type: 'timestamp', nullable: true })
  phoneOtpExpires: Date | null;

  @Column({ default: true })
  isActive: boolean;

  // Anti-spam / reputation
  @Column({ default: 100 })
  reputationScore: number;

  @Column({ default: 0 })
  dailyReportCount: number;

  @Column({ type: 'date', nullable: true })
  lastReportDate: Date;

  @Column({ default: false })
  isBlacklisted: boolean;

  @Column({ type: 'text', nullable: true })
  blacklistReason: string;

  // Consent
  @Column({ default: false })
  consentGiven: boolean;

  @Column({ type: 'timestamp', nullable: true })
  consentGivenAt: Date;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
