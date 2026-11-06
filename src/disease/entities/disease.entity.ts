import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CirculationLevel,
  DiseaseGroup,
  TransmissionRoute,
} from '../disease-scoring';

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

  @Column({ name: 'case_fatality_rate', type: 'numeric', nullable: true })
  caseFatalityRate!: number | null;

  @Column('simple-array', { name: 'transmission_routes', nullable: true })
  transmissionRoutes!: TransmissionRoute[] | null;

  @Column({ name: 'r0', type: 'numeric', nullable: true })
  r0!: number | null;

  @Column({ name: 'has_vaccine', type: 'boolean', nullable: true })
  hasVaccine!: boolean | null;

  @Column({
    name: 'has_specific_treatment',
    type: 'boolean',
    nullable: true,
  })
  hasSpecificTreatment!: boolean | null;

  @Column({
    name: 'circulation_level',
    type: 'varchar',
    nullable: true,
  })
  circulationLevel!: CirculationLevel | null;

  @Column({
    name: 'is_novel_special_dangerous',
    type: 'boolean',
    nullable: true,
  })
  isNovelSpecialDangerous!: boolean | null;

  @Column({ name: 'scoring_notes', type: 'text', nullable: true })
  scoringNotes!: string | null;

  @Column({ name: 'c1', type: 'smallint', nullable: true })
  c1!: number | null;

  @Column({ name: 'c2', type: 'smallint', nullable: true })
  c2!: number | null;

  @Column({ name: 'c3', type: 'smallint', nullable: true })
  c3!: number | null;

  @Column({ name: 'c4', type: 'smallint', nullable: true })
  c4!: number | null;

  @Column({ name: 'sd', type: 'smallint', nullable: true })
  sd!: number | null;

  @Column({ name: 'disease_group', type: 'varchar', nullable: true })
  group!: DiseaseGroup | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
