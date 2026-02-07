import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction, AuditResource } from './entities/audit-log.entity';

export interface CreateAuditLogDto {
  userId: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  description?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async create(dto: CreateAuditLogDto): Promise<AuditLog> {
    const log = this.auditLogRepository.create(dto);
    return this.auditLogRepository.save(log);
  }

  async log(
    userId: string,
    action: AuditAction,
    resource: AuditResource,
    resourceId?: string,
    description?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.create({
        userId,
        action,
        resource,
        resourceId,
        description,
        metadata,
      });
    } catch (error) {
      // Don't throw error if audit logging fails
      console.error('Failed to create audit log:', error);
    }
  }

  async findAll(params: {
    userId?: string;
    action?: AuditAction;
    resource?: AuditResource;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      userId,
      action,
      resource,
      from,
      to,
      page = 1,
      limit = 50,
    } = params;

    const query = this.auditLogRepository
      .createQueryBuilder('audit_log')
      .leftJoinAndSelect('audit_log.user', 'user')
      .orderBy('audit_log.createdAt', 'DESC');

    if (userId) {
      query.andWhere('audit_log.userId = :userId', { userId });
    }

    if (action) {
      query.andWhere('audit_log.action = :action', { action });
    }

    if (resource) {
      query.andWhere('audit_log.resource = :resource', { resource });
    }

    if (from) {
      query.andWhere('audit_log.createdAt >= :from', { from });
    }

    if (to) {
      query.andWhere('audit_log.createdAt <= :to', { to });
    }

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRecentActivity(userId?: string, limit = 20) {
    const query = this.auditLogRepository
      .createQueryBuilder('audit_log')
      .leftJoinAndSelect('audit_log.user', 'user')
      .orderBy('audit_log.createdAt', 'DESC')
      .limit(limit);

    if (userId) {
      query.where('audit_log.userId = :userId', { userId });
    }

    return query.getMany();
  }

  async getStats(params: { from?: Date; to?: Date }) {
    const { from, to } = params;

    const query = this.auditLogRepository
      .createQueryBuilder('audit_log');

    if (from) {
      query.andWhere('audit_log.createdAt >= :from', { from });
    }

    if (to) {
      query.andWhere('audit_log.createdAt <= :to', { to });
    }

    const byAction = await query
      .select('audit_log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit_log.action')
      .getRawMany();

    const byResource = await query
      .select('audit_log.resource', 'resource')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit_log.resource')
      .getRawMany();

    const byUser = await query
      .select('audit_log.user_id', 'userId')
      .addSelect('user.name', 'userName')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('audit_log.user', 'user')
      .groupBy('audit_log.user_id')
      .addGroupBy('user.name')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      byAction,
      byResource,
      byUser,
    };
  }
}
