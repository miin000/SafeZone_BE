import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Disease, DiseaseRiskLevel } from './entities/disease.entity';
import { CreateDiseaseDto, UpdateDiseaseDto } from './dto/disease.dto';
import {
  scoreDisease,
  DiseaseGroup,
  DiseaseScoringAttributes,
} from './disease-scoring';

@Injectable()
export class DiseaseService implements OnModuleInit {
  private readonly logger = new Logger(DiseaseService.name);

  constructor(
    @InjectRepository(Disease)
    private diseaseRepository: Repository<Disease>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.ensureDiseasesTable();
  }

  private async ensureDiseasesTable() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS diseases (
          id UUID PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          name_vi VARCHAR(255),
          description TEXT,
          risk_level VARCHAR(50) NOT NULL DEFAULT 'medium',
          aliases TEXT,
          icd_code VARCHAR(50),
          is_active BOOLEAN NOT NULL DEFAULT true,
          case_fatality_rate NUMERIC,
          transmission_routes TEXT,
          r0 NUMERIC,
          has_vaccine BOOLEAN,
          has_specific_treatment BOOLEAN,
          circulation_level VARCHAR(80),
          is_novel_special_dangerous BOOLEAN,
          scoring_notes TEXT,
          c1 SMALLINT,
          c2 SMALLINT,
          c3 SMALLINT,
          c4 SMALLINT,
          sd SMALLINT,
          disease_group VARCHAR(1),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
        );
      `);

      // Backward-compatible migration (existing DBs)
      await this.dataSource.query(
        `ALTER TABLE diseases ADD COLUMN IF NOT EXISTS name_vi VARCHAR(255);`,
      );
      await this.dataSource.query(`
        ALTER TABLE diseases
          ADD COLUMN IF NOT EXISTS case_fatality_rate NUMERIC,
          ADD COLUMN IF NOT EXISTS transmission_routes TEXT,
          ADD COLUMN IF NOT EXISTS r0 NUMERIC,
          ADD COLUMN IF NOT EXISTS has_vaccine BOOLEAN,
          ADD COLUMN IF NOT EXISTS has_specific_treatment BOOLEAN,
          ADD COLUMN IF NOT EXISTS circulation_level VARCHAR(80),
          ADD COLUMN IF NOT EXISTS is_novel_special_dangerous BOOLEAN,
          ADD COLUMN IF NOT EXISTS scoring_notes TEXT,
          ADD COLUMN IF NOT EXISTS c1 SMALLINT,
          ADD COLUMN IF NOT EXISTS c2 SMALLINT,
          ADD COLUMN IF NOT EXISTS c3 SMALLINT,
          ADD COLUMN IF NOT EXISTS c4 SMALLINT,
          ADD COLUMN IF NOT EXISTS sd SMALLINT,
          ADD COLUMN IF NOT EXISTS disease_group VARCHAR(1);
      `);

      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_diseases_name ON diseases(name);`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_diseases_is_active ON diseases(is_active);`,
      );

      await this.dataSource.query(`
        INSERT INTO diseases (
          id, name, name_vi, description, risk_level, icd_code, is_active,
          case_fatality_rate, transmission_routes, r0, has_vaccine,
          has_specific_treatment, circulation_level, is_novel_special_dangerous,
          scoring_notes
        )
        VALUES
          ('9f66331f-b277-4b17-8661-f04b2676eb9e', 'COVID-19', 'COVID-19', 'Bệnh do virus SARS-CoV-2 gây ra', 'critical', 'U07.1', true, 1.0, 'respiratory', 2.9, true, true, 'pandemic_risk_or_elimination_target', false, 'Giá trị minh họa đã được duyệt; lây qua không khí/giọt bắn.'),
          ('fe95a2d0-a0fd-4f44-b982-e4dca8e41216', 'Dengue', 'Sốt xuất huyết', 'Sốt xuất huyết do muỗi truyền', 'high', 'A90', true, 0.5, 'animal_to_human', 2.5, false, false, 'large_outbreak_or_emerging', false, 'Giá trị minh họa đã được duyệt.'),
          ('5fce8e53-9f57-4121-b2a6-cf6640f7cc5b', 'HFMD', 'Tay chân miệng', 'Tay chân miệng ở trẻ em', 'medium', 'B08.4', true, 0.1, 'respiratory,digestive', 3.0, false, false, 'large_outbreak_or_emerging', false, 'Giá trị minh họa đã được duyệt; đường lây trộn xét theo hô hấp/tiêu hóa và R0.'),
          ('d8b5ed95-6988-488a-9d8c-8d01da5949f0', 'Influenza', 'Cúm mùa', 'Cúm mùa', 'medium', 'J10', true, 0.1, 'respiratory', 1.5, true, true, 'stable_or_sporadic', false, 'Giá trị minh họa đã được duyệt.'),
          ('3205c1e0-ec0f-407d-95b4-0478b3f18666', 'Cholera', 'Bệnh tả', 'Bệnh tả', 'high', 'A00', true, 2.0, 'digestive', 2.0, true, true, 'large_outbreak_or_emerging', false, 'Giá trị minh họa đã được duyệt.'),
          ('244d82d6-f896-49cc-b331-c2f9fd4fd2f4', 'Typhoid', 'Thương hàn', 'Thương hàn', 'high', 'A01.0', true, 0.5, 'digestive', 1.5, true, true, 'stable_or_sporadic', false, 'Giá trị minh họa đã được duyệt.'),
          ('6f56b5ef-91c3-4463-b2bd-817371db7a13', 'Malaria', 'Sốt rét', 'Sốt rét', 'high', 'B50', true, 0.3, 'animal_to_human', 1.5, false, true, 'large_outbreak_or_emerging', false, 'Giá trị minh họa đã được duyệt.')
        ON CONFLICT (name) DO UPDATE SET
          name_vi = EXCLUDED.name_vi,
          description = EXCLUDED.description,
          risk_level = EXCLUDED.risk_level,
          icd_code = EXCLUDED.icd_code,
          is_active = EXCLUDED.is_active,
          case_fatality_rate = EXCLUDED.case_fatality_rate,
          transmission_routes = EXCLUDED.transmission_routes,
          r0 = EXCLUDED.r0,
          has_vaccine = EXCLUDED.has_vaccine,
          has_specific_treatment = EXCLUDED.has_specific_treatment,
          circulation_level = EXCLUDED.circulation_level,
          is_novel_special_dangerous = EXCLUDED.is_novel_special_dangerous,
          scoring_notes = EXCLUDED.scoring_notes;
      `);

      const seededDiseases = await this.diseaseRepository.find();
      for (const disease of seededDiseases) {
        if (
          disease.caseFatalityRate !== null &&
          disease.transmissionRoutes !== null &&
          disease.r0 !== null &&
          disease.hasVaccine !== null &&
          disease.hasSpecificTreatment !== null &&
          disease.circulationLevel !== null &&
          disease.isNovelSpecialDangerous !== null
        ) {
          Object.assign(disease, {
            ...this.calculateScore({
              caseFatalityRate: disease.caseFatalityRate,
              transmissionRoutes: disease.transmissionRoutes,
              r0: disease.r0,
              hasVaccine: disease.hasVaccine,
              hasSpecificTreatment: disease.hasSpecificTreatment,
              circulationLevel: disease.circulationLevel,
              isNovelSpecialDangerous: disease.isNovelSpecialDangerous,
            }),
          });
          await this.diseaseRepository.save(disease);
        }
      }

      // Ensure name_vi is populated for seeded diseases even on older DBs
      await this.dataSource.query(`
        UPDATE diseases
        SET name_vi = CASE name
          WHEN 'COVID-19' THEN 'COVID-19'
          WHEN 'Dengue' THEN 'Sốt xuất huyết'
          WHEN 'HFMD' THEN 'Tay chân miệng'
          WHEN 'Influenza' THEN 'Cúm mùa'
          WHEN 'Cholera' THEN 'Bệnh tả'
          WHEN 'Typhoid' THEN 'Thương hàn'
          WHEN 'Malaria' THEN 'Sốt rét'
          ELSE name_vi
        END
        WHERE name_vi IS NULL;
      `);
    } catch (error: any) {
      this.logger.error(
        `Failed to ensure diseases table exists: ${error?.message ?? error}`,
      );
    }
  }

  async create(createDiseaseDto: CreateDiseaseDto): Promise<Disease> {
    const normalizedDto: CreateDiseaseDto & { nameVi?: string } = {
      ...createDiseaseDto,
      nameVi:
        createDiseaseDto.nameVi ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (createDiseaseDto as any).name_vi,
    };

    // Check if disease already exists
    const existing = await this.diseaseRepository.findOne({
      where: { name: normalizedDto.name },
    });

    if (existing) {
      throw new ConflictException('Disease already exists');
    }

    const score = this.calculateScore(normalizedDto);
    const disease = this.diseaseRepository.create({
      ...normalizedDto,
      ...score,
      group: score.group,
      riskLevel: this.riskLevelFromGroup(score.group),
    });
    return this.diseaseRepository.save(disease);
  }

  async findAll(): Promise<Disease[]> {
    return this.diseaseRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Disease> {
    const disease = await this.diseaseRepository.findOne({
      where: { id },
    });

    if (!disease) {
      throw new NotFoundException(`Disease not found`);
    }

    return disease;
  }

  async findByName(name: string): Promise<Disease> {
    const disease = await this.diseaseRepository.findOne({
      where: { name },
    });

    if (!disease) {
      throw new NotFoundException(`Disease not found`);
    }

    return disease;
  }

  async update(
    id: string,
    updateDiseaseDto: UpdateDiseaseDto,
  ): Promise<Disease> {
    const disease = await this.findOne(id);

    const normalizedDto: UpdateDiseaseDto & { nameVi?: string } = {
      ...updateDiseaseDto,
      nameVi:
        updateDiseaseDto.nameVi ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updateDiseaseDto as any).name_vi,
    };

    // Check if new name conflicts with existing disease
    if (normalizedDto.name && normalizedDto.name !== disease.name) {
      const existing = await this.diseaseRepository.findOne({
        where: { name: normalizedDto.name },
      });

      if (existing) {
        throw new ConflictException('Disease name already exists');
      }
    }

    Object.assign(disease, normalizedDto);
    const score = this.calculateScore({
      caseFatalityRate: disease.caseFatalityRate ?? undefined,
      transmissionRoutes: disease.transmissionRoutes ?? undefined,
      r0: disease.r0 ?? undefined,
      hasVaccine: disease.hasVaccine ?? undefined,
      hasSpecificTreatment: disease.hasSpecificTreatment ?? undefined,
      circulationLevel: disease.circulationLevel ?? undefined,
      isNovelSpecialDangerous: disease.isNovelSpecialDangerous ?? undefined,
    });
    Object.assign(disease, {
      ...score,
      group: score.group,
      riskLevel: this.riskLevelFromGroup(score.group),
    });
    return this.diseaseRepository.save(disease);
  }

  private riskLevelFromGroup(group: DiseaseGroup) {
    if (group === DiseaseGroup.A) return DiseaseRiskLevel.CRITICAL;
    if (group === DiseaseGroup.B) return DiseaseRiskLevel.HIGH;
    return DiseaseRiskLevel.LOW;
  }

  private calculateScore(
    disease: Partial<DiseaseScoringAttributes>,
  ) {
    try {
      if (
        disease.caseFatalityRate === undefined ||
        disease.transmissionRoutes === undefined ||
        disease.r0 === undefined ||
        disease.hasVaccine === undefined ||
        disease.hasSpecificTreatment === undefined ||
        disease.circulationLevel === undefined ||
        disease.isNovelSpecialDangerous === undefined
      ) {
        throw new Error('All disease scoring attributes are required');
      }
      return scoreDisease({
        caseFatalityRate: disease.caseFatalityRate,
        transmissionRoutes: disease.transmissionRoutes,
        r0: disease.r0,
        hasVaccine: disease.hasVaccine,
        hasSpecificTreatment: disease.hasSpecificTreatment,
        circulationLevel: disease.circulationLevel,
        isNovelSpecialDangerous: disease.isNovelSpecialDangerous,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid disease scoring data',
      );
    }
  }

  async remove(id: string): Promise<void> {
    const disease = await this.findOne(id);
    await this.diseaseRepository.remove(disease);
  }

  async search(query: string): Promise<Disease[]> {
    return this.diseaseRepository
      .createQueryBuilder('disease')
      .where('(disease.name ILIKE :query OR disease.aliases ILIKE :query)', {
        query: `%${query}%`,
      })
      .andWhere('disease.isActive = true')
      .orderBy('disease.name', 'ASC')
      .getMany();
  }
}
