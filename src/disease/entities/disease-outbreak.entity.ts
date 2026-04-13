import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OutbreakStatus = 'active' | 'closed';

@Entity('disease_outbreaks')
export class DiseaseOutbreak {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'disease_id', type: 'uuid' })
  diseaseId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: OutbreakStatus;

  @Column({ name: 'reopened_from_outbreak_id', type: 'uuid', nullable: true })
  reopenedFromOutbreakId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
