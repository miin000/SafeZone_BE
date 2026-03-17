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
  id: string;

  @Column({ unique: true })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: DiseaseRiskLevel,
    default: DiseaseRiskLevel.MEDIUM,
  })
  riskLevel: DiseaseRiskLevel;

  // Additional aliases for searching (comma-separated)
  @Column({ nullable: true })
  aliases: string;

  // ICD-10 code if available
  @Column({ nullable: true })
  icdCode: string;

  // Whether this disease is active/enabled
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
