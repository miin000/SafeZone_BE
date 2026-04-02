import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EpidemicZone, RiskLevel } from './entities/epidemic-zone.entity';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Injectable()
export class ZoneService {
  constructor(
    @InjectRepository(EpidemicZone)
    private zoneRepository: Repository<EpidemicZone>,
    private dataSource: DataSource,
  ) {}

  private async syncCaseCountsFromReports(): Promise<void> {
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
      `,
    );
  }

  async create(createZoneDto: CreateZoneDto): Promise<EpidemicZone> {
    const { lat, lon, ...rest } = createZoneDto;

    const zone = this.zoneRepository.create({
      ...rest,
      center: {
        type: 'Point',
        coordinates: [lon, lat],
      },
    });

    const saved = await this.zoneRepository.save(zone);
    await this.syncCaseCountsFromReports();
    return this.findOne(saved.id);
  }

  async findAll(onlyActive: boolean = true): Promise<EpidemicZone[]> {
    await this.syncCaseCountsFromReports();
    const where = onlyActive ? { isActive: true } : {};
    return this.zoneRepository.find({
      where,
      order: { riskLevel: 'DESC', caseCount: 'DESC' },
    });
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
    zone.endDate = new Date();
    return this.zoneRepository.save(zone);
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
      where: { isActive: true },
    });

    const byRiskLevelRaw = await this.zoneRepository
      .createQueryBuilder('zone')
      .select('zone.riskLevel', 'riskLevel')
      .addSelect('COUNT(*)', 'count')
      .where('zone.isActive = :isActive', { isActive: true })
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
      .getRawOne();

    return {
      total,
      active,
      byRiskLevel,
      totalCases: parseInt(totalCasesResult?.total || '0'),
    };
  }
}
