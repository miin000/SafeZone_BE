import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Disease } from './entities/disease.entity';
import { CreateDiseaseDto, UpdateDiseaseDto } from './dto/disease.dto';

@Injectable()
export class DiseaseService {
  constructor(
    @InjectRepository(Disease)
    private diseaseRepository: Repository<Disease>,
  ) {}

  async create(createDiseaseDto: CreateDiseaseDto): Promise<Disease> {
    // Check if disease already exists
    const existing = await this.diseaseRepository.findOne({
      where: { name: createDiseaseDto.name },
    });

    if (existing) {
      throw new ConflictException('Disease already exists');
    }

    const disease = this.diseaseRepository.create(createDiseaseDto);
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

    // Check if new name conflicts with existing disease
    if (updateDiseaseDto.name && updateDiseaseDto.name !== disease.name) {
      const existing = await this.diseaseRepository.findOne({
        where: { name: updateDiseaseDto.name },
      });

      if (existing) {
        throw new ConflictException('Disease name already exists');
      }
    }

    Object.assign(disease, updateDiseaseDto);
    return this.diseaseRepository.save(disease);
  }

  async remove(id: string): Promise<void> {
    const disease = await this.findOne(id);
    await this.diseaseRepository.remove(disease);
  }

  async search(query: string): Promise<Disease[]> {
    return this.diseaseRepository
      .createQueryBuilder('disease')
      .where('disease.name ILIKE :query', { query: `%${query}%` })
      .orWhere('disease.aliases ILIKE :query', { query: `%${query}%` })
      .where('disease.isActive = true')
      .orderBy('disease.name', 'ASC')
      .getMany();
  }
}
