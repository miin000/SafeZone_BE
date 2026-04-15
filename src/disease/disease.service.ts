import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Disease } from './entities/disease.entity';
import { CreateDiseaseDto, UpdateDiseaseDto } from './dto/disease.dto';

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
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
        );
      `);

      // Backward-compatible migration (existing DBs)
      await this.dataSource.query(
        `ALTER TABLE diseases ADD COLUMN IF NOT EXISTS name_vi VARCHAR(255);`,
      );

      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_diseases_name ON diseases(name);`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_diseases_is_active ON diseases(is_active);`,
      );

      await this.dataSource.query(`
        INSERT INTO diseases (id, name, name_vi, description, risk_level, icd_code, is_active)
        VALUES
          ('9f66331f-b277-4b17-8661-f04b2676eb9e', 'COVID-19', 'COVID-19', 'Bệnh do virus SARS-CoV-2 gây ra', 'critical', 'U07.1', true),
          ('fe95a2d0-a0fd-4f44-b982-e4dca8e41216', 'Dengue', 'Sốt xuất huyết', 'Sốt xuất huyết do muỗi truyền', 'high', 'A90', true),
          ('5fce8e53-9f57-4121-b2a6-cf6640f7cc5b', 'HFMD', 'Tay chân miệng', 'Tay chân miệng ở trẻ em', 'medium', 'B08.4', true),
          ('d8b5ed95-6988-488a-9d8c-8d01da5949f0', 'Influenza', 'Cúm mùa', 'Cúm mùa', 'medium', 'J10', true),
          ('3205c1e0-ec0f-407d-95b4-0478b3f18666', 'Cholera', 'Bệnh tả', 'Bệnh tả', 'high', 'A00', true),
          ('244d82d6-f896-49cc-b331-c2f9fd4fd2f4', 'Typhoid', 'Thương hàn', 'Thương hàn', 'high', 'A01.0', true),
          ('6f56b5ef-91c3-4463-b2bd-817371db7a13', 'Malaria', 'Sốt rét', 'Sốt rét', 'high', 'B50', true)
        ON CONFLICT (name) DO NOTHING;
      `);

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

    const disease = this.diseaseRepository.create(normalizedDto);
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
    return this.diseaseRepository.save(disease);
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
