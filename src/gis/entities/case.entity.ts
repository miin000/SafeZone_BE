import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Point } from 'geojson';

@Entity('cases')
export class Case {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: true, unique: true })
  external_id!: string | null;

  @Column({ type: 'text' })
  disease_type!: string;

  @Column({ type: 'uuid', nullable: true })
  disease_id!: string | null;

  @Column({ type: 'text' })
  status!: string;

  @Column({ type: 'smallint', nullable: true })
  severity!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  reported_time!: Date | null;

  @Column({ type: 'text', nullable: true })
  admin_unit_text!: string | null;

  @Column({ type: 'int', nullable: true })
  region_id!: number | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  @Index({ spatial: true })
  geom!: Point;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'text', nullable: true })
  patient_name!: string | null;

  @Column({ type: 'int', nullable: true })
  patient_age!: number | null;

  @Column({ type: 'text', nullable: true })
  patient_gender!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
