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
import { GisService } from '../gis/gis.service';

interface FindAllZoneParams {
  onlyActive?: boolean;
  lifecycleStatus?: ZoneLifecycleStatus;
  source?: ZoneSource;
}

interface ProposeZonesFromDbscanParams {
  from?: string;
  to?: string;
  diseaseTypes?: string[];
  epsKm?: number;
  minPoints?: number;
  minClusterCases?: number;
  minConfidence?: number;
  proposedBy?: string;
}

interface DbscanPreviewSummary {
  diseaseType: string;
  totalClusters: number;
  eligibleClusters: number;
  estimatedProposals: number;
  skipped: {
    clusterTooSmall: number;
    lowConfidence: number;
    invalidCenter: number;
    overlapWithExistingZone: number;
  };
}

@Injectable()
export class ZoneService implements OnModuleInit {
  private schemaReady = false;

  constructor(
    @InjectRepository(EpidemicZone)
    private zoneRepository: Repository<EpidemicZone>,
    private dataSource: DataSource,
    private readonly gisService: GisService,
  ) {}

  async onModuleInit(): Promise<void> {
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

  private getRiskLevelFromCluster(
    combined: number,
    caseCount: number,
  ): RiskLevel {
    if (combined >= 3 || caseCount >= 20) return RiskLevel.CRITICAL;
    if (combined >= 2 || caseCount >= 8) return RiskLevel.HIGH;
    if (combined >= 1 || caseCount >= 3) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  private getProposalConfidence(
    caseCount: number,
    severityScore: number,
    minPoints: number,
  ): number {
    const countScore = Math.min(1, caseCount / Math.max(minPoints * 4, 6));
    const severity = Math.min(1, Math.max(0, severityScore / 3));
    const confidence = 0.65 * countScore + 0.35 * severity;
    return Number(confidence.toFixed(3));
  }

  private normalizeUserId(userId?: string): string | undefined {
    if (!userId) return undefined;
    const clean = userId.trim();
    return clean.length > 0 ? clean : undefined;
  }

  private async resolveDiseaseTypes(diseaseTypes?: string[]) {
    return Array.isArray(diseaseTypes) && diseaseTypes.length > 0
      ? diseaseTypes
      : (
          await this.dataSource.query(
            `
            SELECT DISTINCT disease_type
            FROM cases
            WHERE disease_type IS NOT NULL
            ORDER BY disease_type ASC
            `,
          )
        ).map((r: any) => String(r.disease_type));
  }

  private async countCasesInZoneRadius(
    zone: EpidemicZone,
    options?: { from?: string; to?: string },
  ): Promise<number> {
    const lon = Number(zone.center?.coordinates?.[0]);
    const lat = Number(zone.center?.coordinates?.[1]);
    const radiusKm = Number(zone.radiusKm || 0);

    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(radiusKm) ||
      radiusKm <= 0
    ) {
      return 0;
    }

    const where: string[] = [
      'c.geom IS NOT NULL',
      'c.disease_type = $1',
      'ST_DWithin(c.geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)',
    ];
    const values: any[] = [zone.diseaseType, lon, lat, radiusKm * 1000];

    if (options?.from) {
      values.push(options.from);
      where.push(`c.reported_time >= $${values.length}::timestamptz`);
    }
    if (options?.to) {
      values.push(options.to);
      where.push(`c.reported_time <= $${values.length}::timestamptz`);
    }

    const [row] = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS count
      FROM cases c
      WHERE ${where.join(' AND ')}
      `,
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
          AND c.disease_type = z2."diseaseType"
          AND c.status IN ('suspected', 'probable', 'confirmed', 'under treatment', 'under observation')
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
  }

  async create(
    createZoneDto: CreateZoneDto,
    actorId?: string,
  ): Promise<EpidemicZone> {
    const { lat, lon, ...rest } = createZoneDto;

    const zone = this.zoneRepository.create({
      ...rest,
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
    const {
      onlyActive = true,
      lifecycleStatus,
      source,
    } = params;

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

    // For DBSCAN proposals waiting for approval, keep displayed count consistent
    // with proposal evidence (cluster count) and the current radius-based count.
    const normalized = await Promise.all(
      zones.map(async (zone) => {
        if (
          zone.lifecycleStatus !== ZoneLifecycleStatus.PENDING_APPROVAL ||
          zone.source !== ZoneSource.DBSCAN
        ) {
          return zone;
        }

        const metadata = (zone.proposalMetadata || {}) as Record<string, any>;
        const clusterCaseCount = Number(metadata?.clusterCaseCount ?? NaN);
        const radiusCaseCount = await this.countCasesInZoneRadius(zone, {
          from: metadata?.parameters?.from,
          to: metadata?.parameters?.to,
        });

        const stableCount = Math.max(
          Number(zone.caseCount || 0),
          Number.isFinite(clusterCaseCount) ? clusterCaseCount : 0,
          radiusCaseCount,
        );

        zone.caseCount = stableCount;
        zone.proposalMetadata = {
          ...metadata,
          radiusCaseCountCurrent: radiusCaseCount,
        };

        return zone;
      }),
    );

    return normalized;
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
    const metadata = (zone.proposalMetadata || {}) as Record<string, any>;
    const clusterCaseCount = Number(metadata?.clusterCaseCount ?? 0);
    const radiusCaseCount = await this.countCasesInZoneRadius(zone, {
      from: metadata?.parameters?.from,
      to: metadata?.parameters?.to,
    });

    zone.lifecycleStatus = ZoneLifecycleStatus.APPROVED;
    zone.isActive = true;
    zone.reviewedAt = new Date();
    zone.reviewedBy = this.normalizeUserId(reviewerId) || zone.reviewedBy;
    zone.reviewNote = note || zone.reviewNote;
    zone.startDate = zone.startDate || new Date();
    zone.caseCount = Math.max(Number(zone.caseCount || 0), clusterCaseCount, radiusCaseCount);
    zone.proposalMetadata = {
      ...metadata,
      clusterCaseCount,
      radiusCaseCountAtApproval: radiusCaseCount,
      approvedCaseCount: zone.caseCount,
    };

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

  async previewDbscanProposals(params: ProposeZonesFromDbscanParams) {
    const {
      from,
      to,
      diseaseTypes,
      epsKm = 3,
      minPoints = 4,
      minClusterCases = 3,
      minConfidence = 0.45,
    } = params;

    const sourceDiseaseTypes = await this.resolveDiseaseTypes(diseaseTypes);
    const summary: DbscanPreviewSummary[] = [];

    for (const diseaseType of sourceDiseaseTypes) {
      const stat: DbscanPreviewSummary = {
        diseaseType,
        totalClusters: 0,
        eligibleClusters: 0,
        estimatedProposals: 0,
        skipped: {
          clusterTooSmall: 0,
          lowConfidence: 0,
          invalidCenter: 0,
          overlapWithExistingZone: 0,
        },
      };

      const clusterResponse: any = await this.gisService.getClusteredCases({
        diseaseType,
        from,
        to,
        clusterDistanceKm: epsKm,
        minPoints,
        includeNoise: false,
      });

      const clusters = Array.isArray(clusterResponse?.clusters)
        ? clusterResponse.clusters
        : [];
      stat.totalClusters = clusters.length;

      for (const cluster of clusters) {
        const caseCount = Number(cluster?.count || 0);
        const severityScore = Number(cluster?.severity?.score || 1);
        const confidence = this.getProposalConfidence(
          caseCount,
          severityScore,
          minPoints,
        );

        if (caseCount < minClusterCases) {
          stat.skipped.clusterTooSmall += 1;
          continue;
        }

        if (confidence < minConfidence) {
          stat.skipped.lowConfidence += 1;
          continue;
        }

        const centerLat = Number(cluster?.center?.lat);
        const centerLon = Number(cluster?.center?.lon);
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
          stat.skipped.invalidCenter += 1;
          continue;
        }

        const farthestKm = Number(cluster?.spatial?.maxDistanceKm || 0);
        const epsBasedRadius = Math.max(0.3, epsKm * 1.1);
        const farthestBasedRadius = Math.max(
          0.3,
          farthestKm + Math.max(0.25, epsKm * 0.12),
        );
        const radiusKm = Math.max(
          0.3,
          Math.min(
            80,
            Number(Math.max(epsBasedRadius, farthestBasedRadius).toFixed(2)),
          ),
        );
        const [nearExisting] = await this.dataSource.query(
          `
          SELECT z.id
          FROM epidemic_zones z
          WHERE z."diseaseType" = $1
            AND z."lifecycleStatus" IN ('pending_approval', 'approved')
            AND ST_DWithin(
              z.center::geography,
              ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
              GREATEST((z."radiusKm" + $4) * 500, 300)
            )
            AND z."createdAt" >= NOW() - INTERVAL '21 days'
          LIMIT 1
          `,
          [diseaseType, centerLon, centerLat, radiusKm],
        );

        if (nearExisting?.id) {
          stat.skipped.overlapWithExistingZone += 1;
          continue;
        }

        stat.eligibleClusters += 1;
      }

      stat.estimatedProposals = stat.eligibleClusters;
      summary.push(stat);
    }

    const totals = summary.reduce(
      (acc, s) => {
        acc.totalClusters += s.totalClusters;
        acc.eligibleClusters += s.eligibleClusters;
        acc.estimatedProposals += s.estimatedProposals;
        acc.skipped.clusterTooSmall += s.skipped.clusterTooSmall;
        acc.skipped.lowConfidence += s.skipped.lowConfidence;
        acc.skipped.invalidCenter += s.skipped.invalidCenter;
        acc.skipped.overlapWithExistingZone += s.skipped.overlapWithExistingZone;
        return acc;
      },
      {
        totalClusters: 0,
        eligibleClusters: 0,
        estimatedProposals: 0,
        skipped: {
          clusterTooSmall: 0,
          lowConfidence: 0,
          invalidCenter: 0,
          overlapWithExistingZone: 0,
        },
      },
    );

    return {
      parameters: {
        from,
        to,
        epsKm,
        minPoints,
        minClusterCases,
        minConfidence,
      },
      diseaseCount: sourceDiseaseTypes.length,
      totals,
      summary,
    };
  }

  async proposeFromDbscan(params: ProposeZonesFromDbscanParams) {
    const {
      from,
      to,
      diseaseTypes,
      epsKm = 3,
      minPoints = 4,
      minClusterCases = 3,
      minConfidence = 0.45,
      proposedBy,
    } = params;

    const sourceDiseaseTypes = await this.resolveDiseaseTypes(diseaseTypes);

    const created: EpidemicZone[] = [];
    const skipped: Array<{ diseaseType: string; reason: string; clusterId?: string }> = [];

    for (const diseaseType of sourceDiseaseTypes) {
      const clusterResponse: any = await this.gisService.getClusteredCases({
        diseaseType,
        from,
        to,
        clusterDistanceKm: epsKm,
        minPoints,
        includeNoise: false,
      });

      const clusters = Array.isArray(clusterResponse?.clusters)
        ? clusterResponse.clusters
        : [];

      for (const cluster of clusters) {
        const caseCount = Number(cluster?.count || 0);
        const severityScore = Number(cluster?.severity?.score || 1);
        const confidence = this.getProposalConfidence(
          caseCount,
          severityScore,
          minPoints,
        );

        if (caseCount < minClusterCases) {
          skipped.push({
            diseaseType,
            clusterId: String(cluster?.id ?? ''),
            reason: 'cluster_too_small',
          });
          continue;
        }
        if (confidence < minConfidence) {
          skipped.push({
            diseaseType,
            clusterId: String(cluster?.id ?? ''),
            reason: 'low_confidence',
          });
          continue;
        }

        const centerLat = Number(cluster?.center?.lat);
        const centerLon = Number(cluster?.center?.lon);
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
          skipped.push({
            diseaseType,
            clusterId: String(cluster?.id ?? ''),
            reason: 'invalid_cluster_center',
          });
          continue;
        }

        const farthestKm = Number(cluster?.spatial?.maxDistanceKm || 0);
        const epsBasedRadius = Math.max(0.3, epsKm * 1.1);
        const farthestBasedRadius = Math.max(0.3, farthestKm + Math.max(0.25, epsKm * 0.12));
        const radiusKm = Math.max(
          0.3,
          Math.min(80, Number(Math.max(epsBasedRadius, farthestBasedRadius).toFixed(2))),
        );
        const [nearExisting] = await this.dataSource.query(
          `
          SELECT z.id
          FROM epidemic_zones z
          WHERE z."diseaseType" = $1
            AND z."lifecycleStatus" IN ('pending_approval', 'approved')
            AND ST_DWithin(
              z.center::geography,
              ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
              GREATEST((z."radiusKm" + $4) * 500, 300)
            )
            AND z."createdAt" >= NOW() - INTERVAL '21 days'
          LIMIT 1
          `,
          [diseaseType, centerLon, centerLat, radiusKm],
        );

        if (nearExisting?.id) {
          skipped.push({
            diseaseType,
            clusterId: String(cluster?.id ?? ''),
            reason: 'overlap_with_existing_zone',
          });
          continue;
        }

        const riskLevel = this.getRiskLevelFromCluster(
          Number(cluster?.severity?.combined || 1),
          caseCount,
        );
        const now = new Date();
        const zone = this.zoneRepository.create({
          name: `Đề xuất ổ dịch ${diseaseType} (${now.toLocaleDateString('vi-VN')})`,
          diseaseType,
          center: { type: 'Point', coordinates: [centerLon, centerLat] },
          radiusKm,
          riskLevel,
          caseCount,
          description:
            `Đề xuất tự động từ DBSCAN. Cụm #${cluster?.id ?? 'n/a'}, ` +
            `confidence=${confidence}, eps=${epsKm}km, minPoints=${minPoints}.`,
          isActive: false,
          lifecycleStatus: ZoneLifecycleStatus.PENDING_APPROVAL,
          source: ZoneSource.DBSCAN,
          proposalConfidence: confidence,
          proposalMetadata: {
            algorithm: 'DBSCAN',
            clusterId: cluster?.id,
            dbscan: cluster?.dbscan || null,
            clusterCaseCount: caseCount,
            spatial: cluster?.spatial || null,
            severity: cluster?.severity || null,
            timeRange: cluster?.timeRange || null,
            parameters: {
              epsKm,
              minPoints,
              minClusterCases,
              minConfidence,
              from,
              to,
            },
          },
          proposedAt: now,
          proposedBy: this.normalizeUserId(proposedBy) || null,
        });

        const saved = await this.zoneRepository.save(zone);
        created.push(saved);
      }
    }

    return {
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
      parameters: {
        from,
        to,
        epsKm,
        minPoints,
        minClusterCases,
        minConfidence,
      },
    };
  }

  async updateCaseCount(id: string, caseCount: number): Promise<EpidemicZone> {
    const zone = await this.findOne(id);
    zone.caseCount = caseCount;

    // Auto-update risk level based on case count
    if (caseCount >= 100) {
      zone.riskLevel = RiskLevel.CRITICAL;
    } else if (caseCount >= 50) {
      zone.riskLevel = RiskLevel.HIGH;
    } else if (caseCount >= 20) {
      zone.riskLevel = RiskLevel.MEDIUM;
    } else {
      zone.riskLevel = RiskLevel.LOW;
    }

    return this.zoneRepository.save(zone);
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
