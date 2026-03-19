import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { HealthInfo, HealthInfoStatus } from './entities/health-info.entity';
import {
  CreateHealthInfoDto,
  UpdateHealthInfoDto,
  QueryHealthInfoDto,
} from './dto';

@Injectable()
export class HealthInfoService implements OnModuleInit {
  constructor(
    @InjectRepository(HealthInfo)
    private healthInfoRepository: Repository<HealthInfo>,
    private dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query(
        `ALTER TYPE health_info_status_enum ADD VALUE IF NOT EXISTS 'reviewed'`,
      );
    } catch (_) {
      // Ignore when enum does not exist in local/dev snapshots.
    }

    await this.dataSource.query(`
      ALTER TABLE health_info
      ADD COLUMN IF NOT EXISTS "diseaseType" VARCHAR(50) NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS "target" VARCHAR(50) NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS "severityLevel" VARCHAR(50) NOT NULL DEFAULT 'low'
    `);
  }

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
      diseaseType,
      target,
      severityLevel,
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

    if (diseaseType) {
      queryBuilder.andWhere('healthInfo.diseaseType = :diseaseType', {
        diseaseType,
      });
    }

    if (target) {
      queryBuilder.andWhere('healthInfo.target = :target', { target });
    }

    if (severityLevel) {
      queryBuilder.andWhere('healthInfo.severityLevel = :severityLevel', {
        severityLevel,
      });
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
    const { status, ...rest } = query;
    if (status) {
      return this.findAll({ ...rest, status });
    }

    const queryBuilder = this.healthInfoRepository
      .createQueryBuilder('healthInfo')
      .leftJoinAndSelect('healthInfo.author', 'author')
      .where('healthInfo.status IN (:...statuses)', {
        statuses: [HealthInfoStatus.REVIEWED, HealthInfoStatus.PUBLISHED],
      })
      .orderBy('healthInfo.publishedAt', 'DESC');

    if (rest.category) {
      queryBuilder.andWhere('healthInfo.category = :category', {
        category: rest.category,
      });
    }
    if (rest.diseaseType) {
      queryBuilder.andWhere('healthInfo.diseaseType = :diseaseType', {
        diseaseType: rest.diseaseType,
      });
    }
    if (rest.target) {
      queryBuilder.andWhere('healthInfo.target = :target', {
        target: rest.target,
      });
    }
    if (rest.severityLevel) {
      queryBuilder.andWhere('healthInfo.severityLevel = :severityLevel', {
        severityLevel: rest.severityLevel,
      });
    }
    if (rest.search) {
      queryBuilder.andWhere(
        '(healthInfo.title ILIKE :search OR healthInfo.content ILIKE :search OR healthInfo.summary ILIKE :search)',
        { search: `%${rest.search}%` },
      );
    }
    if (rest.tag) {
      queryBuilder.andWhere(':tag = ANY(healthInfo.tags)', { tag: rest.tag });
    }

    const page = rest.page ?? 1;
    const limit = rest.limit ?? 10;
    queryBuilder.skip((page - 1) * limit).take(limit);

    let [items, total] = await queryBuilder.getManyAndCount();

    // Bootstrap-friendly fallback: if no reviewed/published content exists yet,
    // temporarily expose draft items so mobile does not appear empty.
    if (total === 0 && !status) {
      const fallback = await this.findAll({
        ...rest,
        status: HealthInfoStatus.DRAFT,
        page,
        limit,
      });
      items = fallback.items;
      total = fallback.meta.total;
    }

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

  async findFeatured(limit: number = 5) {
    return this.healthInfoRepository.find({
      where: {
        status: In([HealthInfoStatus.REVIEWED, HealthInfoStatus.PUBLISHED]),
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
        status: In([HealthInfoStatus.REVIEWED, HealthInfoStatus.PUBLISHED]),
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
      throw new NotFoundException(
        `Không tìm thấy thông tin y tế với ID: ${id}`,
      );
    }

    return healthInfo;
  }

  async findOnePublished(id: string): Promise<HealthInfo> {
    const healthInfo = await this.healthInfoRepository.findOne({
      where: {
        id,
        status: In([HealthInfoStatus.REVIEWED, HealthInfoStatus.PUBLISHED]),
      },
      relations: ['author'],
    });

    if (!healthInfo) {
      throw new NotFoundException(
        `Không tìm thấy thông tin y tế với ID: ${id}`,
      );
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
