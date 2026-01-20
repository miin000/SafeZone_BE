import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from './entities/report.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { GisService } from '../gis/gis.service';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    private notificationService: NotificationService,
    @Inject(forwardRef(() => GisService))
    private gisService: GisService,
  ) {}

  async create(userId: string, createReportDto: CreateReportDto): Promise<Report> {
    const { lat, lon, reporterLat, reporterLon, isDetailedReport, patientInfo, ...rest } = createReportDto;

    const reportData: Partial<Report> = {
      ...rest,
      userId,
      isDetailedReport: isDetailedReport || false,
      patientInfo: patientInfo ? {
        fullName: patientInfo.fullName,
        age: patientInfo.age,
        gender: patientInfo.gender,
        idNumber: patientInfo.idNumber,
        phone: patientInfo.phone,
        address: patientInfo.address,
        occupation: patientInfo.occupation,
        workplace: patientInfo.workplace,
        symptomOnsetDate: patientInfo.symptomOnsetDate,
        healthFacility: patientInfo.healthFacility,
        isHospitalized: patientInfo.isHospitalized,
        travelHistory: patientInfo.travelHistory,
        contactHistory: patientInfo.contactHistory,
        underlyingConditions: patientInfo.underlyingConditions,
      } : undefined,
      location: {
        type: 'Point',
        coordinates: [lon, lat],
      },
    };

    // Store reporter's location if provided
    if (reporterLat !== undefined && reporterLon !== undefined) {
      reportData.reporterLocation = {
        type: 'Point',
        coordinates: [reporterLon, reporterLat],
      };
    }

    const report = this.reportRepository.create(reportData);
    const savedReport = await this.reportRepository.save(report);

    // Create notification for the user about successful report submission
    const notificationTitle = isDetailedReport 
      ? 'Báo cáo chi tiết ca bệnh đã được gửi'
      : 'Báo cáo đã được gửi thành công';
    
    const notificationBody = isDetailedReport
      ? `Báo cáo chi tiết về ca ${createReportDto.diseaseType} đã được ghi nhận. Cơ quan y tế sẽ xác minh và liên hệ nếu cần thêm thông tin.`
      : `Báo cáo về ${createReportDto.diseaseType} đã được ghi nhận. Cơ quan y tế sẽ xác minh thông tin của bạn.`;

    await this.notificationService.sendToUser(
      userId,
      notificationTitle,
      notificationBody,
      NotificationType.REPORT_UPDATE,
      {
        reportId: savedReport.id,
        diseaseType: createReportDto.diseaseType,
        status: 'pending',
        isDetailedReport: isDetailedReport || false,
      },
    );

    return savedReport;
  }

  async findAll(queryDto: QueryReportDto): Promise<{
    data: Report[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, status, diseaseType, startDate, endDate } = queryDto;

    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.user', 'user')
      .orderBy('report.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('report.status = :status', { status });
    }

    if (diseaseType) {
      queryBuilder.andWhere('report.diseaseType = :diseaseType', { diseaseType });
    }

    if (startDate) {
      queryBuilder.andWhere('report.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('report.createdAt <= :endDate', { endDate });
    }

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Remove user password from response
    data.forEach((report) => {
      if (report.user) {
        delete report.user.password;
      }
    });

    return { data, total, page, limit };
  }

  async findByUser(userId: string): Promise<Report[]> {
    const reports = await this.reportRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    reports.forEach((report) => {
      if (report.user) {
        delete report.user.password;
      }
    });

    return reports;
  }

  async findOne(id: string): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!report) {
      throw new NotFoundException('Báo cáo không tồn tại');
    }

    if (report.user) {
      delete report.user.password;
    }

    return report;
  }

  async findNearby(lat: number, lon: number, radiusKm: number = 5): Promise<Report[]> {
    const reports = await this.reportRepository
      .createQueryBuilder('report')
      .where(
        `ST_DWithin(
          report.location::geography,
          ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
          :radius
        )`,
        { lat, lon, radius: radiusKm * 1000 },
      )
      .andWhere('report.status IN (:...statuses)', {
        statuses: [ReportStatus.PENDING, ReportStatus.VERIFIED],
      })
      .orderBy('report.createdAt', 'DESC')
      .getMany();

    return reports;
  }

  async update(
    id: string,
    userId: string,
    updateReportDto: UpdateReportDto,
    isAdmin: boolean = false,
  ): Promise<Report> {
    const report = await this.findOne(id);

    // Only owner or admin can update
    if (!isAdmin && report.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật báo cáo này');
    }

    // Users can only update certain fields
    if (!isAdmin) {
      delete updateReportDto.status;
      delete updateReportDto.adminNote;
    }

    Object.assign(report, updateReportDto);
    return this.reportRepository.save(report);
  }

  async updateStatus(
    id: string,
    adminId: string,
    status: ReportStatus,
    adminNote?: string,
    createCase?: boolean,
  ): Promise<{ report: Report; case?: any }> {
    const report = await this.findOne(id);

    report.status = status;
    if (adminNote !== undefined) {
      report.adminNote = adminNote;
    }
    report.verifiedAt = new Date();
    report.verifiedBy = adminId;

    const updatedReport = await this.reportRepository.save(report);

    let createdCase;

    // Create case when approving a detailed report
    if (status === ReportStatus.VERIFIED && createCase && report.isDetailedReport) {
      try {
        const lat = report.location?.coordinates?.[1];
        const lon = report.location?.coordinates?.[0];
        
        createdCase = await this.gisService.createCase({
          disease_type: report.diseaseType,
          status: 'confirmed',
          severity: 2, // Default to medium severity
          reported_time: report.createdAt.toISOString(),
          lat: lat,
          lon: lon,
          patient_name: report.patientInfo?.fullName || undefined,
          patient_age: report.patientInfo?.age || undefined,
          patient_gender: report.patientInfo?.gender || undefined,
          notes: `Từ báo cáo chi tiết #${report.id}. ${report.description || ''}`,
        });
      } catch (error) {
        console.error('Failed to create case from report:', error);
      }
    }

    // Notify user about status change
    if (report.userId) {
      const statusMessages = {
        [ReportStatus.VERIFIED]: {
          title: 'Báo cáo đã được xác minh',
          body: `Báo cáo của bạn về ${report.diseaseType} đã được cơ quan y tế xác minh.`,
        },
        [ReportStatus.REJECTED]: {
          title: 'Báo cáo không được chấp nhận',
          body: `Báo cáo của bạn về ${report.diseaseType} không được chấp nhận.${adminNote ? ` Lý do: ${adminNote}` : ''}`,
        },
        [ReportStatus.RESOLVED]: {
          title: 'Báo cáo đã được xử lý',
          body: `Báo cáo của bạn về ${report.diseaseType} đã được xử lý xong.`,
        },
      };

      const message = statusMessages[status];
      if (message) {
        await this.notificationService.sendToUser(
          report.userId,
          message.title,
          message.body,
          NotificationType.REPORT_UPDATE,
          {
            reportId: id,
            status,
            diseaseType: report.diseaseType,
          },
        );
      }
    }

    return { report: updatedReport, case: createdCase };
  }

  async remove(id: string, userId: string, isAdmin: boolean = false): Promise<void> {
    const report = await this.findOne(id);

    if (!isAdmin && report.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa báo cáo này');
    }

    await this.reportRepository.remove(report);
  }

  async getStats(): Promise<{
    total: number;
    pending: number;
    verified: number;
    rejected: number;
    byDisease: Record<string, number>;
  }> {
    const total = await this.reportRepository.count();
    const pending = await this.reportRepository.count({
      where: { status: ReportStatus.PENDING },
    });
    const verified = await this.reportRepository.count({
      where: { status: ReportStatus.VERIFIED },
    });
    const rejected = await this.reportRepository.count({
      where: { status: ReportStatus.REJECTED },
    });

    const byDiseaseRaw = await this.reportRepository
      .createQueryBuilder('report')
      .select('report.diseaseType', 'diseaseType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('report.diseaseType')
      .getRawMany();

    const byDisease = byDiseaseRaw.reduce(
      (acc, item) => {
        acc[item.diseaseType] = parseInt(item.count);
        return acc;
      },
      {} as Record<string, number>,
    );

    return { total, pending, verified, rejected, byDisease };
  }
}
