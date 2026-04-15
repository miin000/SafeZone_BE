import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DiseaseRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('diseases')
export class Disease {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ name: 'name_vi', nullable: true })
  nameVi!: string;

  @Column('text', { nullable: true })
  description!: string;

  @Column({
    name: 'risk_level',
    type: 'varchar',
    default: DiseaseRiskLevel.MEDIUM,
  })
  riskLevel!: DiseaseRiskLevel;

  // Additional aliases for searching (comma-separated)
  @Column({ nullable: true })
  aliases!: string;

  // ICD-10 code if available
  @Column({ name: 'icd_code', nullable: true })
  icdCode!: string;

  // Whether this disease is active/enabled
  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
