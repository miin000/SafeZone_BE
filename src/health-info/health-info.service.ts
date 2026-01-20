import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { HealthInfo, HealthInfoStatus } from './entities/health-info.entity';
import {
  CreateHealthInfoDto,
  UpdateHealthInfoDto,
  QueryHealthInfoDto,
} from './dto';

@Injectable()
export class HealthInfoService {
  constructor(
    @InjectRepository(HealthInfo)
    private healthInfoRepository: Repository<HealthInfo>,
  ) {}

  async create(
    createDto: CreateHealthInfoDto,
    authorId: string,
  ): Promise<HealthInfo> {
    const healthInfo = this.healthInfoRepository.create({
      ...createDto,
      authorId,
      status: HealthInfoStatus.DRAFT,
    });
    return this.healthInfoRepository.save(healthInfo);
  }

  async findAll(query: QueryHealthInfoDto) {
    const {
      category,
      status,
      search,
      tag,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.healthInfoRepository
      .createQueryBuilder('healthInfo')
      .leftJoinAndSelect('healthInfo.author', 'author');

    // Filter by category
    if (category) {
      queryBuilder.andWhere('healthInfo.category = :category', { category });
    }

    // Filter by status
    if (status) {
      queryBuilder.andWhere('healthInfo.status = :status', { status });
    }

    // Search in title, content, summary
    if (search) {
      queryBuilder.andWhere(
        '(healthInfo.title ILIKE :search OR healthInfo.content ILIKE :search OR healthInfo.summary ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Filter by tag
    if (tag) {
      queryBuilder.andWhere(':tag = ANY(healthInfo.tags)', { tag });
    }

    // Sorting
    const allowedSortFields = [
      'createdAt',
      'updatedAt',
      'viewCount',
      'title',
      'publishedAt',
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(
      `healthInfo.${sortField}`,
      sortOrder === 'ASC' ? 'ASC' : 'DESC',
    );

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublished(query: QueryHealthInfoDto) {
    return this.findAll({
      ...query,
      status: HealthInfoStatus.PUBLISHED,
    });
  }

  async findFeatured(limit: number = 5) {
    return this.healthInfoRepository.find({
      where: {
        status: HealthInfoStatus.PUBLISHED,
        isFeatured: true,
      },
      order: { publishedAt: 'DESC' },
      take: limit,
      relations: ['author'],
    });
  }

  async findByCategory(category: string, limit: number = 10) {
    return this.healthInfoRepository.find({
      where: {
        category: category as any,
        status: HealthInfoStatus.PUBLISHED,
      },
      order: { publishedAt: 'DESC' },
      take: limit,
      relations: ['author'],
    });
  }

  async findOne(id: string): Promise<HealthInfo> {
    const healthInfo = await this.healthInfoRepository.findOne({
      where: { id },
      relations: ['author'],
    });

    if (!healthInfo) {
      throw new NotFoundException(`Không tìm thấy thông tin y tế với ID: ${id}`);
    }

    return healthInfo;
  }

  async findOnePublished(id: string): Promise<HealthInfo> {
    const healthInfo = await this.healthInfoRepository.findOne({
      where: { id, status: HealthInfoStatus.PUBLISHED },
      relations: ['author'],
    });

    if (!healthInfo) {
      throw new NotFoundException(`Không tìm thấy thông tin y tế với ID: ${id}`);
    }

    // Increment view count
    await this.incrementViewCount(id);

    return healthInfo;
  }

  async update(
    id: string,
    updateDto: UpdateHealthInfoDto,
  ): Promise<HealthInfo> {
    const healthInfo = await this.findOne(id);

    Object.assign(healthInfo, updateDto);

    return this.healthInfoRepository.save(healthInfo);
  }

  async publish(id: string): Promise<HealthInfo> {
    const healthInfo = await this.findOne(id);

    healthInfo.status = HealthInfoStatus.PUBLISHED;
    healthInfo.publishedAt = new Date();

    return this.healthInfoRepository.save(healthInfo);
  }

  async archive(id: string): Promise<HealthInfo> {
    const healthInfo = await this.findOne(id);

    healthInfo.status = HealthInfoStatus.ARCHIVED;

    return this.healthInfoRepository.save(healthInfo);
  }

  async remove(id: string): Promise<void> {
    const healthInfo = await this.findOne(id);
    await this.healthInfoRepository.remove(healthInfo);
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.healthInfoRepository.increment({ id }, 'viewCount', 1);
  }

  async getStats() {
    const total = await this.healthInfoRepository.count();
    const published = await this.healthInfoRepository.count({
      where: { status: HealthInfoStatus.PUBLISHED },
    });
    const draft = await this.healthInfoRepository.count({
      where: { status: HealthInfoStatus.DRAFT },
    });
    const archived = await this.healthInfoRepository.count({
      where: { status: HealthInfoStatus.ARCHIVED },
    });

    const byCategory = await this.healthInfoRepository
      .createQueryBuilder('healthInfo')
      .select('healthInfo.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('healthInfo.category')
      .getRawMany();

    return {
      total,
      published,
      draft,
      archived,
      byCategory,
    };
  }
}
