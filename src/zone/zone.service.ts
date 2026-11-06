import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  EpidemicZone,
  RiskLevel,
  ZoneLifecycleStatus,
  ZoneSource,
} from './entities/epidemic-zone.entity';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

interface FindAllZoneParams {
  onlyActive?: boolean;
  lifecycleStatus?: ZoneLifecycleStatus;
  source?: ZoneSource;
}

@Injectable()
export class ZoneService implements OnModuleInit {
  private schemaReady = false;
  // Illustrative weights, not calibrated against epidemiological outcomes.
  private readonly riskWeights = {
    disease: Number(process.env.ZONE_RISK_ALPHA || 0.4),
    cases: Number(process.env.ZONE_RISK_BETA || 0.3),
    density: Number(process.env.ZONE_RISK_GAMMA || 0.3),
  };

  constructor(
    @InjectRepository(EpidemicZone)
    private zoneRepository: Repository<EpidemicZone>,
    private dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    const weightTotal =
      this.riskWeights.disease +
      this.riskWeights.cases +
      this.riskWeights.density;
    if (Math.abs(weightTotal - 1) > 0.0001) {
      throw new Error('ZONE_RISK_ALPHA/BETA/GAMMA must sum to 1');
    }
    await this.ensureZoneSchema();
  }

  private async ensureZoneSchema(): Promise<void> {
    if (this.schemaReady) return;

    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "lifecycleStatus" varchar(32)
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "source" varchar(16)
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "proposalConfidence" double precision
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "proposalMetadata" jsonb
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "proposedAt" timestamptz
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "proposedBy" varchar(255)
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "reviewedBy" varchar(255)
    `);
    await this.dataSource.query(`
      ALTER TABLE epidemic_zones
      ADD COLUMN IF NOT EXISTS "reviewNote" text
    `);

    // Optional FK to diseases catalog
    await this.dataSource.query(
      `ALTER TABLE epidemic_zones ADD COLUMN IF NOT EXISTS "diseaseId" uuid;`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_epidemic_zones_disease_id ON epidemic_zones("diseaseId");`,
    );

    // Best-effort backfill from legacy diseaseType text (exact name match, case-insensitive)
    await this.dataSource.query(
      `
      UPDATE epidemic_zones z
      SET "diseaseId" = d.id
      FROM diseases d
      WHERE z."diseaseId" IS NULL
        AND z."diseaseType" IS NOT NULL
        AND LOWER(TRIM(z."diseaseType")) = LOWER(TRIM(d.name))
      `,
    );

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF to_regclass('public.diseases') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_epidemic_zones_disease_id'
          )
        THEN
          ALTER TABLE epidemic_zones
            ADD CONSTRAINT fk_epidemic_zones_disease_id
            FOREIGN KEY ("diseaseId")
            REFERENCES diseases(id)
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await this.dataSource.query(`
      UPDATE epidemic_zones
      SET "lifecycleStatus" = 'approved'
      WHERE "lifecycleStatus" IS NULL OR TRIM("lifecycleStatus") = ''
    `);
    await this.dataSource.query(`
      UPDATE epidemic_zones
      SET "source" = 'manual'
      WHERE "source" IS NULL OR TRIM("source") = ''
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_epidemic_zones_lifecycle
      ON epidemic_zones ("lifecycleStatus")
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_epidemic_zones_source
      ON epidemic_zones ("source")
    `);

    this.schemaReady = true;
  }

  private normalizeUserId(userId?: string): string | undefined {
    const clean = userId?.trim();
    return clean || undefined;
  }

  private async countCasesInZoneRadius(
    zone: EpidemicZone,
    options?: { from?: string; to?: string },
  ): Promise<number> {
    const [lon, lat] = zone.center?.coordinates || [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || zone.radiusKm <= 0) {
      return 0;
    }

    const values: unknown[] = [
      zone.diseaseId,
      lon,
      lat,
      zone.radiusKm * 1000,
      zone.diseaseType,
    ];
    const filters = [
      'c.geom IS NOT NULL',
      '((c.disease_id = $1::uuid) OR (c.disease_id IS NULL AND c.disease_type = $5))',
      'c.is_archived IS NOT TRUE',
      'c.status = \'confirmed\'',
      'ST_DWithin(c.geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)',
    ];
    if (options?.from) {
      values.push(options.from);
      filters.push(`c.reported_time >= $${values.length}::timestamptz`);
    }
    if (options?.to) {
      values.push(options.to);
      filters.push(`c.reported_time <= $${values.length}::timestamptz`);
    }

    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM cases c WHERE ${filters.join(' AND ')}`,
      values,
    );
    return Number(row?.count || 0);
  }

  private async syncCaseCountsFromReports(): Promise<void> {
    await this.ensureZoneSchema();

    await this.dataSource.query(
      `
      UPDATE epidemic_zones z
      SET "caseCount" = COALESCE(sub.count, 0)
      FROM (
        SELECT
          z2.id,
          COUNT(c.id)::int AS count
        FROM epidemic_zones z2
        LEFT JOIN cases c
          ON c.geom IS NOT NULL
          AND (
            (z2."diseaseId" IS NOT NULL AND c.disease_id = z2."diseaseId")
            OR (z2."diseaseId" IS NULL AND c.disease_type = z2."diseaseType")
            OR (z2."diseaseId" IS NOT NULL AND c.disease_id IS NULL AND c.disease_type = z2."diseaseType")
          )
          AND c.is_archived IS NOT TRUE
          AND c.status = 'confirmed'
          AND ST_DWithin(
            z2.center::geography,
            c.geom::geography,
            z2."radiusKm" * 1000
          )
        GROUP BY z2.id
      ) sub
      WHERE z.id = sub.id
        AND z."lifecycleStatus" = 'approved'
        AND z."source" = 'manual'
      `,
    );
    await this.recalculateAllRisks();
  }

  private async recalculateAllRisks(): Promise<void> {
    const zones = await this.zoneRepository.find({
      where: { lifecycleStatus: ZoneLifecycleStatus.APPROVED },
    });
    if (!zones.length) return;

    const counts = zones.map((zone) => Number(zone.caseCount || 0));
    const densities = zones.map((zone) => {
      const area = Math.PI * Math.max(Number(zone.radiusKm), 0.1) ** 2;
      return Number(zone.caseCount || 0) / area;
    });
    const minMax = (values: number[]) => ({
      min: Math.min(...values),
      max: Math.max(...values),
    });
    const countRange = minMax(counts);
    const densityRange = minMax(densities);

    for (const zone of zones) {
      const [disease] = await this.dataSource.query(
        `SELECT sd FROM diseases WHERE id = $1 OR ($1 IS NULL AND name = $2) LIMIT 1`,
        [zone.diseaseId, zone.diseaseType],
      );
      const diseaseScore = Math.min(1, Math.max(0, (Number(disease?.sd || 4) - 4) / 8));
      const count = Number(zone.caseCount || 0);
      const density = count / (Math.PI * Math.max(Number(zone.radiusKm), 0.1) ** 2);
      const normalize = (value: number, range: { min: number; max: number }) =>
        range.max === range.min ? 0 : (value - range.min) / (range.max - range.min);
      const caseScore = normalize(count, countRange);
      const densityScore = normalize(density, densityRange);
      const total =
        this.riskWeights.disease * diseaseScore +
        this.riskWeights.cases * caseScore +
        this.riskWeights.density * densityScore;

      zone.riskScore = Number(total.toFixed(4));
      zone.riskComponents = {
        disease: Number(diseaseScore.toFixed(4)),
        cases: Number(caseScore.toFixed(4)),
        density: Number(densityScore.toFixed(4)),
      };
      zone.riskLevel =
        total < 0.4
          ? RiskLevel.LOW
          : total < 0.7
            ? RiskLevel.MEDIUM
            : RiskLevel.HIGH;
      await this.zoneRepository.save(zone);
    }
  }

  async create(
    createZoneDto: CreateZoneDto,
    actorId?: string,
  ): Promise<EpidemicZone> {
    const { lat, lon, ...rest } = createZoneDto;

    const resolvedDiseaseIdRows = createZoneDto.diseaseId
      ? null
      : await this.dataSource.query(
          `SELECT id FROM diseases WHERE name = $1 LIMIT 1`,
          [createZoneDto.diseaseType],
        );
    const resolvedDiseaseId: string | null =
      (createZoneDto.diseaseId ?? resolvedDiseaseIdRows?.[0]?.id) || null;

    const zone = this.zoneRepository.create({
      ...rest,
      diseaseId: resolvedDiseaseId,
      source: createZoneDto.source || ZoneSource.MANUAL,
      lifecycleStatus:
        createZoneDto.lifecycleStatus || ZoneLifecycleStatus.APPROVED,
      isActive:
        createZoneDto.lifecycleStatus === ZoneLifecycleStatus.PENDING_APPROVAL
          ? false
          : (createZoneDto.isActive ?? true),
      proposedBy:
        createZoneDto.proposedBy || this.normalizeUserId(actorId) || null,
      proposedAt: new Date(),
      center: {
        type: 'Point',
        coordinates: [lon, lat],
      },
    });

    const saved = await this.zoneRepository.save(zone);
    await this.syncCaseCountsFromReports();
    return this.findOne(saved.id);
  }

  async findAll(params: FindAllZoneParams = {}): Promise<EpidemicZone[]> {
    const { onlyActive = true, lifecycleStatus, source } = params;

    await this.syncCaseCountsFromReports();

    const qb = this.zoneRepository
      .createQueryBuilder('zone')
      .orderBy('zone.riskLevel', 'DESC')
      .addOrderBy('zone.caseCount', 'DESC')
      .addOrderBy('zone.updatedAt', 'DESC');

    if (onlyActive) {
      qb.andWhere('zone.isActive = true');
    }
    if (lifecycleStatus) {
      qb.andWhere('zone.lifecycleStatus = :lifecycleStatus', {
        lifecycleStatus,
      });
    }
    if (source) {
      qb.andWhere('zone.source = :source', { source });
    }

    const zones = await qb.getMany();

    return zones;
  }

  async findOne(id: string): Promise<EpidemicZone> {
    const zone = await this.zoneRepository.findOne({ where: { id } });
    if (!zone) {
      throw new NotFoundException('Vùng dịch không tồn tại');
    }
    return zone;
  }

  async findNearby(
    lat: number,
    lon: number,
    radiusKm: number = 10,
  ): Promise<EpidemicZone[]> {
    return this.zoneRepository
      .createQueryBuilder('zone')
      .where(
        `ST_DWithin(
          zone.center::geography,
          ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
          :radius + (zone."radiusKm" * 1000)
        )`,
        { lat, lon, radius: radiusKm * 1000 },
      )
      .andWhere('zone.lifecycleStatus = :lifecycleStatus', {
        lifecycleStatus: ZoneLifecycleStatus.APPROVED,
      })
      .andWhere('zone.isActive = :isActive', { isActive: true })
      .andWhere('zone.caseCount > 0')
      .andWhere('(zone."startDate" IS NULL OR zone."startDate" <= NOW())')
      .andWhere('(zone."endDate" IS NULL OR zone."endDate" >= NOW())')
      .orderBy('zone.riskLevel', 'DESC')
      .addOrderBy('zone.caseCount', 'DESC')
      .getMany();
  }

  async checkPointInZone(lat: number, lon: number): Promise<EpidemicZone[]> {
    return this.zoneRepository
      .createQueryBuilder('zone')
      .where(
        `ST_DWithin(
          zone.center::geography,
          ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
          zone."radiusKm" * 1000
        )`,
        { lat, lon },
      )
      .andWhere('zone.lifecycleStatus = :lifecycleStatus', {
        lifecycleStatus: ZoneLifecycleStatus.APPROVED,
      })
      .andWhere('zone.isActive = :isActive', { isActive: true })
      .andWhere('zone.caseCount > 0')
      .andWhere('(zone."startDate" IS NULL OR zone."startDate" <= NOW())')
      .andWhere('(zone."endDate" IS NULL OR zone."endDate" >= NOW())')
      .orderBy('zone.riskLevel', 'DESC')
      .addOrderBy('zone.caseCount', 'DESC')
      .getMany();
  }

  async update(
    id: string,
    updateZoneDto: UpdateZoneDto,
  ): Promise<EpidemicZone> {
    const zone = await this.findOne(id);

    if (updateZoneDto.diseaseId !== undefined) {
      zone.diseaseId = updateZoneDto.diseaseId || null;
    } else if (updateZoneDto.diseaseType !== undefined) {
      const rows = await this.dataSource.query(
        `SELECT id FROM diseases WHERE name = $1 LIMIT 1`,
        [updateZoneDto.diseaseType],
      );
      zone.diseaseId = (rows?.[0]?.id as string | undefined) ?? null;
    }

    if (updateZoneDto.lat !== undefined && updateZoneDto.lon !== undefined) {
      zone.center = {
        type: 'Point',
        coordinates: [updateZoneDto.lon, updateZoneDto.lat],
      };
    }

    const { lat, lon, ...rest } = updateZoneDto;
    Object.assign(zone, rest);

    if (updateZoneDto.lifecycleStatus === ZoneLifecycleStatus.APPROVED) {
      zone.reviewedAt = new Date();
      zone.isActive = updateZoneDto.isActive ?? true;
      zone.startDate = zone.startDate || new Date();
    }
    if (updateZoneDto.lifecycleStatus === ZoneLifecycleStatus.REJECTED) {
      zone.reviewedAt = new Date();
      zone.isActive = false;
    }

    await this.zoneRepository.save(zone);
    await this.syncCaseCountsFromReports();
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const zone = await this.findOne(id);
    await this.zoneRepository.remove(zone);
  }

  async deactivate(id: string): Promise<EpidemicZone> {
    const zone = await this.findOne(id);
    zone.isActive = false;
    zone.lifecycleStatus = ZoneLifecycleStatus.CLOSED;
    zone.endDate = new Date();
    return this.zoneRepository.save(zone);
  }

  async approveProposal(
    id: string,
    reviewerId?: string,
    note?: string,
  ): Promise<EpidemicZone> {
    const zone = await this.findOne(id);
    const radiusCaseCount = await this.countCasesInZoneRadius(zone);

    zone.lifecycleStatus = ZoneLifecycleStatus.APPROVED;
    zone.isActive = true;
    zone.reviewedAt = new Date();
    zone.reviewedBy = this.normalizeUserId(reviewerId) || zone.reviewedBy;
    zone.reviewNote = note || zone.reviewNote;
    zone.startDate = zone.startDate || new Date();
    zone.caseCount = Math.max(Number(zone.caseCount || 0), radiusCaseCount);
    zone.proposalMetadata = null;
    zone.proposalConfidence = null;

    await this.zoneRepository.save(zone);
    await this.syncCaseCountsFromReports();
    return this.findOne(id);
  }

  async rejectProposal(
    id: string,
    reviewerId?: string,
    note?: string,
  ): Promise<EpidemicZone> {
    const zone = await this.findOne(id);
    zone.lifecycleStatus = ZoneLifecycleStatus.REJECTED;
    zone.isActive = false;
    zone.reviewedAt = new Date();
    zone.reviewedBy = this.normalizeUserId(reviewerId) || zone.reviewedBy;
    zone.reviewNote = note || zone.reviewNote;

    await this.zoneRepository.save(zone);
    return this.findOne(id);
  }


  async getStats(): Promise<{
    total: number;
    active: number;
    byRiskLevel: Record<RiskLevel, number>;
    totalCases: number;
  }> {
    await this.syncCaseCountsFromReports();
    const total = await this.zoneRepository.count();
    const active = await this.zoneRepository.count({
      where: {
        isActive: true,
        lifecycleStatus: ZoneLifecycleStatus.APPROVED,
      },
    });

    const byRiskLevelRaw = await this.zoneRepository
      .createQueryBuilder('zone')
      .select('zone.riskLevel', 'riskLevel')
      .addSelect('COUNT(*)', 'count')
      .where('zone.isActive = :isActive', { isActive: true })
      .andWhere('zone.lifecycleStatus = :lifecycleStatus', {
        lifecycleStatus: ZoneLifecycleStatus.APPROVED,
      })
      .groupBy('zone.riskLevel')
      .getRawMany();

    const byRiskLevel = Object.values(RiskLevel).reduce(
      (acc, level) => {
        acc[level] = 0;
        return acc;
      },
      {} as Record<RiskLevel, number>,
    );

    byRiskLevelRaw.forEach((item) => {
      byRiskLevel[item.riskLevel as RiskLevel] = parseInt(item.count);
    });

    const totalCasesResult = await this.zoneRepository
      .createQueryBuilder('zone')
      .select('SUM(zone.caseCount)', 'total')
      .where('zone.isActive = :isActive', { isActive: true })
      .andWhere('zone.lifecycleStatus = :lifecycleStatus', {
        lifecycleStatus: ZoneLifecycleStatus.APPROVED,
      })
      .getRawOne();

    return {
      total,
      active,
      byRiskLevel,
      totalCases: parseInt(totalCasesResult?.total || '0'),
    };
  }
}
