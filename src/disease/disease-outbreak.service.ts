import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Disease } from './entities/disease.entity';
import { DiseaseOutbreak } from './entities/disease-outbreak.entity';
import {
  CloseOutbreakDto,
  CreateOutbreakDto,
  NewOutbreakFromOldDto,
  UpdateOutbreakDto,
} from './dto/disease-outbreak.dto';

@Injectable()
export class DiseaseOutbreakService implements OnModuleInit {
  private readonly logger = new Logger(DiseaseOutbreakService.name);
  private schemaReady = false;

  constructor(
    @InjectRepository(Disease)
    private readonly diseaseRepository: Repository<Disease>,
    @InjectRepository(DiseaseOutbreak)
    private readonly outbreakRepository: Repository<DiseaseOutbreak>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureOutbreakSchema();
  }

  private async ensureOutbreakSchema(): Promise<void> {
    if (this.schemaReady) return;

    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS disease_outbreaks (
          id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
          disease_id uuid NOT NULL,
          name varchar(255),
          description text,
          start_date timestamptz NOT NULL,
          end_date timestamptz,
          status varchar(16) NOT NULL DEFAULT 'active',
          reopened_from_outbreak_id uuid,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (status IN ('active', 'closed'))
        );
      `);

      await this.dataSource.query(
        `ALTER TABLE disease_outbreaks ADD COLUMN IF NOT EXISTS description text;`,
      );

      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_disease_outbreaks_disease_id ON disease_outbreaks(disease_id);`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_disease_outbreaks_status ON disease_outbreaks(status);`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_disease_outbreaks_dates ON disease_outbreaks(disease_id, start_date, end_date);`,
      );
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_disease_outbreaks_one_active
         ON disease_outbreaks(disease_id)
         WHERE status = 'active';`,
      );

      // cases table extensions (soft hide/archiving)
      await this.dataSource.query(
        `ALTER TABLE cases ADD COLUMN IF NOT EXISTS outbreak_id uuid;`,
      );

      // cases.disease_id: FK to diseases.id (optional for backward compatibility)
      await this.dataSource.query(
        `ALTER TABLE cases ADD COLUMN IF NOT EXISTS disease_id uuid;`,
      );
      await this.dataSource.query(
        `ALTER TABLE cases ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;`,
      );
      await this.dataSource.query(
        `ALTER TABLE cases ADD COLUMN IF NOT EXISTS archived_at timestamptz;`,
      );

      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_cases_outbreak_id ON cases(outbreak_id);`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_cases_disease_id ON cases(disease_id);`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_cases_is_archived ON cases(is_archived);`,
      );

      // Best-effort backfill: map legacy cases.disease_type (text) -> cases.disease_id
      // Only fills when disease_type matches a catalog disease by exact name.
      await this.dataSource.query(
        `
        UPDATE cases c
        SET disease_id = d.id
        FROM diseases d
        WHERE c.disease_id IS NULL
          AND c.disease_type IS NOT NULL
          AND c.disease_type = d.name
        `,
      );

      // FK: only create if diseases table exists
      await this.dataSource.query(`
        DO $$
        BEGIN
          IF to_regclass('public.diseases') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'fk_cases_disease_id'
            )
          THEN
            ALTER TABLE cases
              ADD CONSTRAINT fk_cases_disease_id
              FOREIGN KEY (disease_id)
              REFERENCES diseases(id)
              ON DELETE SET NULL;
          END IF;
        END$$;
      `);

      // FK: best-effort (avoid failing startup if already exists)
      await this.dataSource.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_cases_outbreak_id'
          ) THEN
            ALTER TABLE cases
              ADD CONSTRAINT fk_cases_outbreak_id
              FOREIGN KEY (outbreak_id)
              REFERENCES disease_outbreaks(id)
              ON DELETE SET NULL;
          END IF;
        END$$;
      `);

      this.schemaReady = true;
    } catch (error: any) {
      this.logger.error(
        `Failed to ensure outbreak schema: ${error?.message ?? error}`,
      );
    }
  }

  private assertValidEndDate(outbreak: { startDate: Date }, endDate: Date) {
    if (Number.isNaN(endDate.getTime())) {
      throw new ConflictException('Invalid endDate');
    }
    if (endDate.getTime() < outbreak.startDate.getTime()) {
      throw new ConflictException('endDate must be >= startDate');
    }
  }

  private async archiveCasesByOutbreakWindow(outbreak: DiseaseOutbreak) {
    if (!outbreak.endDate) return;

    const disease = await this.diseaseRepository.findOne({
      where: { id: outbreak.diseaseId },
    });
    if (!disease) throw new NotFoundException('Disease not found');

    const diseaseName = disease.name;

    await this.dataSource.query(
      `
      UPDATE cases c
      SET outbreak_id = COALESCE(c.outbreak_id, $1)
      WHERE c.outbreak_id IS NULL
        AND c.reported_time IS NOT NULL
        AND (
          c.disease_id = $2
          OR (c.disease_id IS NULL AND c.disease_type = $3)
        )
        AND c.reported_time >= $4::timestamptz
        AND c.reported_time <= $5::timestamptz
      `,
      [
        outbreak.id,
        outbreak.diseaseId,
        diseaseName,
        outbreak.startDate.toISOString(),
        outbreak.endDate.toISOString(),
      ],
    );

    await this.dataSource.query(
      `
      UPDATE cases c
      SET is_archived = true,
          archived_at = now(),
          outbreak_id = COALESCE(c.outbreak_id, $1)
      WHERE c.reported_time IS NOT NULL
        AND (
          c.disease_id = $2
          OR (c.disease_id IS NULL AND c.disease_type = $3)
        )
        AND c.reported_time >= $4::timestamptz
        AND c.reported_time <= $5::timestamptz
      `,
      [
        outbreak.id,
        outbreak.diseaseId,
        diseaseName,
        outbreak.startDate.toISOString(),
        outbreak.endDate.toISOString(),
      ],
    );
  }

  async listByDisease(diseaseId: string): Promise<DiseaseOutbreak[]> {
    const disease = await this.diseaseRepository.findOne({
      where: { id: diseaseId },
    });
    if (!disease) throw new NotFoundException('Disease not found');

    return this.outbreakRepository.find({
      where: { diseaseId },
      order: { startDate: 'DESC' },
    });
  }

  async createForDisease(
    diseaseId: string,
    dto: CreateOutbreakDto,
  ): Promise<DiseaseOutbreak> {
    const disease = await this.diseaseRepository.findOne({
      where: { id: diseaseId },
    });
    if (!disease) throw new NotFoundException('Disease not found');

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    const isClosedAtCreate = Boolean(endDate);
    if (endDate) {
      this.assertValidEndDate({ startDate }, endDate);
    }

    // Only enforce uniqueness for *active* outbreaks.
    if (!isClosedAtCreate) {
      const active = await this.outbreakRepository.findOne({
        where: { diseaseId, status: 'active' },
      });
      if (active) {
        throw new ConflictException(
          'This disease already has an active outbreak',
        );
      }
    }

    const outbreak = this.outbreakRepository.create({
      diseaseId,
      name: dto.name?.trim() || null,
      description: dto.description?.trim() || null,
      startDate,
      endDate,
      status: isClosedAtCreate ? 'closed' : 'active',
      reopenedFromOutbreakId: null,
    });

    const saved = await this.outbreakRepository.save(outbreak);

    // If admin creates a closed outbreak for history/backfill, sync cases by time window.
    if (saved.status === 'closed' && saved.endDate) {
      await this.archiveCasesByOutbreakWindow(saved);
    }

    return saved;
  }

  async close(
    outbreakId: string,
    dto: CloseOutbreakDto,
  ): Promise<DiseaseOutbreak> {
    const outbreak = await this.outbreakRepository.findOne({
      where: { id: outbreakId },
    });
    if (!outbreak) throw new NotFoundException('Outbreak not found');

    if (outbreak.status === 'closed') return outbreak;

    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    this.assertValidEndDate(outbreak, endDate);

    outbreak.status = 'closed';
    outbreak.endDate = endDate;

    const saved = await this.outbreakRepository.save(outbreak);

    // Sync cases by time window so outbreak matches cases' reported_time (no manual linking).
    await this.archiveCasesByOutbreakWindow(saved);

    return saved;
  }

  async reopen(outbreakId: string): Promise<DiseaseOutbreak> {
    const outbreak = await this.outbreakRepository.findOne({
      where: { id: outbreakId },
    });
    if (!outbreak) throw new NotFoundException('Outbreak not found');

    if (outbreak.status === 'active') return outbreak;

    const active = await this.outbreakRepository.findOne({
      where: { diseaseId: outbreak.diseaseId, status: 'active' },
    });
    if (active) {
      throw new ConflictException(
        'This disease already has another active outbreak',
      );
    }

    outbreak.status = 'active';
    outbreak.endDate = null;

    const saved = await this.outbreakRepository.save(outbreak);

    // Unarchive cases to show again
    await this.dataSource.query(
      `UPDATE cases SET is_archived = false, archived_at = NULL WHERE outbreak_id = $1`,
      [outbreakId],
    );

    return saved;
  }

  async newFromOld(
    outbreakId: string,
    dto: NewOutbreakFromOldDto,
  ): Promise<{ closedOld: DiseaseOutbreak; newOutbreak: DiseaseOutbreak }> {
    const oldOutbreak = await this.outbreakRepository.findOne({
      where: { id: outbreakId },
    });
    if (!oldOutbreak) throw new NotFoundException('Outbreak not found');

    const closeOldAt = dto.closeOldAt ? new Date(dto.closeOldAt) : new Date();
    const closedOld = await this.close(outbreakId, {
      endDate: closeOldAt.toISOString(),
    });

    const newOutbreak = this.outbreakRepository.create({
      diseaseId: oldOutbreak.diseaseId,
      name: dto.name?.trim() || null,
      description: null,
      startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
      endDate: null,
      status: 'active',
      reopenedFromOutbreakId: oldOutbreak.id,
    });

    const savedNew = await this.outbreakRepository.save(newOutbreak);

    return { closedOld, newOutbreak: savedNew };
  }

  async update(
    outbreakId: string,
    dto: UpdateOutbreakDto,
  ): Promise<DiseaseOutbreak> {
    const outbreak = await this.outbreakRepository.findOne({
      where: { id: outbreakId },
    });
    if (!outbreak) throw new NotFoundException('Outbreak not found');

    const nextStartDate = dto.startDate
      ? new Date(dto.startDate)
      : outbreak.startDate;
    const nextEndDate =
      dto.endDate !== undefined
        ? dto.endDate
          ? new Date(dto.endDate)
          : null
        : outbreak.endDate;

    if (nextEndDate) {
      this.assertValidEndDate({ startDate: nextStartDate }, nextEndDate);
    }

    outbreak.name =
      dto.name !== undefined ? dto.name?.trim() || null : outbreak.name;
    outbreak.description =
      dto.description !== undefined
        ? dto.description?.trim() || null
        : outbreak.description;
    outbreak.startDate = nextStartDate;
    outbreak.endDate = nextEndDate;

    return this.outbreakRepository.save(outbreak);
  }

  async remove(outbreakId: string): Promise<{ ok: true }> {
    const outbreak = await this.outbreakRepository.findOne({
      where: { id: outbreakId },
    });
    if (!outbreak) throw new NotFoundException('Outbreak not found');

    // Restore (unarchive) cases linked to this outbreak.
    await this.dataSource.query(
      `UPDATE cases
       SET is_archived = false,
           archived_at = NULL,
           outbreak_id = NULL
       WHERE outbreak_id = $1`,
      [outbreakId],
    );

    await this.outbreakRepository.delete({ id: outbreakId });

    return { ok: true };
  }
}
