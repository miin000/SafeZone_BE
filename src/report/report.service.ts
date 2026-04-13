import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Report,
  ReportStatus,
  ReportStatusHistory,
} from './entities/report.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { GisService } from '../gis/gis.service';
import { ZoneService } from '../zone/zone.service';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(ReportStatusHistory)
    private statusHistoryRepository: Repository<ReportStatusHistory>,
    private notificationService: NotificationService,
    @Inject(forwardRef(() => GisService))
    private gisService: GisService,
    private zoneService: ZoneService,
  ) {}

  // Log status change to audit trail
  private async logStatusChange(
    reportId: string,
    previousStatus: string | null | undefined,
    newStatus: string,
    changedBy?: string,
    changedByRole?: string,
    note?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const history = this.statusHistoryRepository.create({
        reportId,
        previousStatus: previousStatus ?? undefined,
        newStatus,
        changedBy,
        changedByRole,
        note,
        metadata,
      });
      await this.statusHistoryRepository.save(history);
    } catch (error) {
      console.error('Failed to log status change:', error);
    }
  }

  async create(
    userId: string,
    createReportDto: CreateReportDto,
  ): Promise<Report> {
    this.logger.log(
      `Create report request userId=${userId} reportType=${createReportDto.reportType ?? 'case_report'} disease=${createReportDto.diseaseType} imageCount=${createReportDto.imageUrls?.length ?? 0} testResultImageCount=${createReportDto.testResultImageUrls?.length ?? 0} medicalCertImageCount=${createReportDto.medicalCertImageUrls?.length ?? 0}`,
    );

    const {
      lat,
      lon,
      reporterLat,
      reporterLon,
      isDetailedReport,
      patientInfo,
      ...rest
    } = createReportDto;

    const normalizedDescription = (createReportDto.description || '').trim();
    if (!normalizedDescription) {
      throw new BadRequestException('Mô tả báo cáo không được để trống');
    }

    const reportType = createReportDto.reportType || 'case_report';

    const savedReport = await this.reportRepository.manager.transaction(
      async (manager) => {
        const txUserRepository = manager.getRepository(User);
        const txReportRepository = manager.getRepository(Report);
        const txStatusHistoryRepository =
          manager.getRepository(ReportStatusHistory);

        const user = await txUserRepository
          .createQueryBuilder('user')
          .setLock('pessimistic_write')
          .where('user.id = :userId', { userId })
          .getOne();

        if (!user) {
          throw new NotFoundException('Người dùng không tồn tại');
        }

        if (user.isBlacklisted) {
          throw new ForbiddenException(
            'Tài khoản của bạn đã bị khóa và không thể gửi báo cáo',
          );
        }

        if (!user.isEmailVerified && !user.isPhoneVerified) {
          throw new ForbiddenException(
            'Vui lòng xác thực OTP email hoặc số điện thoại trước khi gửi báo cáo',
          );
        }

        const duplicateWindowMinutes = 10;
        const duplicateReport = await txReportRepository
          .createQueryBuilder('report')
          .where('report.userId = :userId', { userId })
          .andWhere('report.diseaseType = :diseaseType', {
            diseaseType: createReportDto.diseaseType,
          })
          .andWhere('report.reportType = :reportType', {
            reportType,
          })
          .andWhere(
            `ST_DWithin(
              report.location::geography,
              ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
              600
            )`,
            { lat, lon },
          )
          .andWhere(
            'LOWER(TRIM(report.description)) = LOWER(TRIM(:description))',
            { description: normalizedDescription },
          )
          .andWhere(
            `report.createdAt >= NOW() - INTERVAL '${duplicateWindowMinutes} minutes'`,
          )
          .orderBy('report.createdAt', 'DESC')
          .getOne();

        if (duplicateReport) {
          throw new BadRequestException(
            'Bạn vừa gửi báo cáo tương tự trong vài phút gần đây. Vui lòng tránh gửi trùng.',
          );
        }

        const recentHourlyCount = await txReportRepository
          .createQueryBuilder('report')
          .where('report.userId = :userId', { userId })
          .andWhere(`report.createdAt >= NOW() - INTERVAL '1 hour'`)
          .getCount();

        if (recentHourlyCount >= 8) {
          throw new BadRequestException(
            'Bạn đã gửi quá nhiều báo cáo trong 1 giờ qua. Vui lòng thử lại sau.',
          );
        }

        if (createReportDto.deviceId) {
          const deviceHourlyCount = await txReportRepository
            .createQueryBuilder('report')
            .where('report.deviceId = :deviceId', {
              deviceId: createReportDto.deviceId,
            })
            .andWhere(`report.createdAt >= NOW() - INTERVAL '1 hour'`)
            .getCount();

          if (deviceHourlyCount >= 10) {
            throw new BadRequestException(
              'Thiết bị đã gửi quá nhiều báo cáo trong 1 giờ qua. Vui lòng thử lại sau.',
            );
          }
        }

        const reportData: Partial<Report> = {
          ...rest,
          userId,
          description: normalizedDescription,
          status: ReportStatus.SUBMITTED,
          reportType,
          isDetailedReport: isDetailedReport || false,
          isSelfReport: createReportDto.isSelfReport ?? true,
          reporterName: createReportDto.reporterName,
          reporterPhone: createReportDto.reporterPhone,
          severityLevel: createReportDto.severityLevel || 'medium',
          reporterConsent: createReportDto.reporterConsent || false,
          deviceId: createReportDto.deviceId,
          // Epidemiological info
          hasContactWithPatient: createReportDto.hasContactWithPatient,
          hasVisitedEpidemicArea: createReportDto.hasVisitedEpidemicArea,
          hasSimilarCasesNearby: createReportDto.hasSimilarCasesNearby,
          estimatedNearbyCount: createReportDto.estimatedNearbyCount,
          // Medical info
          hasVisitedDoctor: createReportDto.hasVisitedDoctor,
          hasTestResult: createReportDto.hasTestResult,
          testResultDescription: createReportDto.testResultDescription,
          testResultImageUrls: createReportDto.testResultImageUrls,
          medicalCertImageUrls: createReportDto.medicalCertImageUrls,
          // Outbreak fields
          locationDescription: createReportDto.locationDescription,
          locationType: createReportDto.locationType as any,
          suspectedDisease: createReportDto.suspectedDisease,
          outbreakDescription: createReportDto.outbreakDescription,
          discoveryTime: createReportDto.discoveryTime
            ? new Date(createReportDto.discoveryTime)
            : undefined,
          patientInfo: patientInfo
            ? {
                fullName: patientInfo.fullName,
                age: patientInfo.age,
                yearOfBirth: patientInfo.yearOfBirth,
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
              }
            : undefined,
          // Patient query columns
          patientGender: patientInfo?.gender,
          patientYearOfBirth: patientInfo?.yearOfBirth,
          patientPhone: patientInfo?.phone,
          symptomOnsetDate: patientInfo?.symptomOnsetDate
            ? new Date(patientInfo.symptomOnsetDate)
            : undefined,
          location: {
            type: 'Point',
            coordinates: [lon, lat],
          },
        };

        if (
          createReportDto.hasSimilarCasesNearby === undefined ||
          createReportDto.estimatedNearbyCount === undefined
        ) {
          try {
            const zones = await this.zoneService.checkPointInZone(lat, lon);
            if (createReportDto.hasSimilarCasesNearby === undefined) {
              reportData.hasSimilarCasesNearby = zones.length > 0;
            }
            if (createReportDto.estimatedNearbyCount === undefined) {
              reportData.estimatedNearbyCount = zones.reduce(
                (sum, zone) => sum + (zone.caseCount || 0),
                0,
              );
            }
          } catch (error) {
            console.error('Failed to derive zone proximity for report:', error);
          }
        }

        if (reporterLat !== undefined && reporterLon !== undefined) {
          reportData.reporterLocation = {
            type: 'Point',
            coordinates: [reporterLon, reporterLat],
          };
        }

        const report = txReportRepository.create(reportData);
        const createdReport = await txReportRepository.save(report);

        const statusHistory = txStatusHistoryRepository.create({
          reportId: createdReport.id,
          previousStatus: undefined,
          newStatus: ReportStatus.SUBMITTED,
          changedBy: userId,
          changedByRole: 'user',
          note: 'Báo cáo được tạo',
        });
        await txStatusHistoryRepository.save(statusHistory);

        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const lastReportDay = user.lastReportDate
          ? user.lastReportDate instanceof Date
            ? user.lastReportDate.toISOString().slice(0, 10)
            : String(user.lastReportDate).slice(0, 10)
          : null;

        user.dailyReportCount =
          lastReportDay === today ? (user.dailyReportCount || 0) + 1 : 1;
        user.lastReportDate = now;
        await txUserRepository.save(user);

        return createdReport;
      },
    );

    // Note: Automatic verification has been removed.
    // Reports now go directly from SUBMITTED to waiting for preliminary review.
    // Admin must manually verify and approve the report.

    // Notify user
    const reportTypeLabel =
      createReportDto.reportType === 'outbreak_alert'
        ? 'Cảnh báo ổ dịch'
        : isDetailedReport
          ? 'Báo cáo chi tiết ca bệnh'
          : 'Báo cáo dịch bệnh';

    await this.notificationService.sendToUser(
      userId,
      `${reportTypeLabel} đã được gửi`,
      `Báo cáo về ${createReportDto.diseaseType} đã được ghi nhận (Mã: ${savedReport.id.substring(0, 8)}). Cơ quan y tế sẽ xác minh thông tin.`,
      NotificationType.REPORT_UPDATE,
      {
        reportId: savedReport.id,
        diseaseType: createReportDto.diseaseType,
        status: ReportStatus.SUBMITTED,
        reportType: createReportDto.reportType || 'case_report',
      },
    );

    this.logger.log(
      `Create report success reportId=${savedReport.id} userId=${userId} status=${savedReport.status}`,
    );

    return savedReport;
  }

  // Step 1: Auto verification (basic checks, no AI for now)
  private async performAutoVerification(report: Report): Promise<void> {
    const autoResult = {
      phoneVerified: true, // Already verified via PhoneVerifiedGuard
      gpsValid:
        report.location?.coordinates?.[0] !== 0 &&
        report.location?.coordinates?.[1] !== 0,
      duplicateCheck: true, // TODO: implement duplicate detection
      riskLevel: report.severityLevel || 'medium',
      timestamp: new Date().toISOString(),
    };

    report.autoVerifiedAt = new Date();
    report.autoVerificationResult = autoResult as any;
    report.status = ReportStatus.AUTO_VERIFIED;
    await this.reportRepository.save(report);

    await this.logStatusChange(
      report.id,
      ReportStatus.SUBMITTED,
      ReportStatus.AUTO_VERIFIED,
      undefined,
      'system',
      'Hệ thống xác nhận tự động',
      autoResult,
    );
  }

  // Step 2: Preliminary review by local health authority
  async performPreliminaryReview(
    reportId: string,
    reviewerId: string,
    reviewerRole: string,
    result: 'valid' | 'need_field_check' | 'invalid',
    note?: string,
  ): Promise<Report> {
    const report = await this.findOne(reportId);

    const previousStatus = report.status;
    report.preliminaryReviewBy = reviewerId;
    report.preliminaryReviewAt = new Date();
    report.preliminaryReviewNote = note || '';
    report.preliminaryReviewResult = result;

    if (result === 'invalid') {
      report.status = ReportStatus.REJECTED;
    } else if (result === 'need_field_check') {
      report.status = ReportStatus.FIELD_VERIFICATION;
    } else {
      report.status = ReportStatus.UNDER_REVIEW;
    }

    const updatedReport = await this.reportRepository.save(report);

    await this.logStatusChange(
      reportId,
      previousStatus,
      report.status,
      reviewerId,
      reviewerRole,
      note,
      { result },
    );

    // Notify reporter
    const resultMessages = {
      valid: 'Báo cáo đã được xác nhận sơ bộ. Đang chờ xác minh chính thức.',
      need_field_check:
        'Báo cáo cần kiểm tra thực địa. Nhân viên y tế sẽ đến xác minh.',
      invalid: `Báo cáo không hợp lệ.${note ? ` Lý do: ${note}` : ''}`,
    };

    await this.notificationService.sendToUser(
      report.userId,
      result === 'invalid'
        ? 'Báo cáo không được chấp nhận'
        : 'Cập nhật báo cáo',
      resultMessages[result],
      NotificationType.REPORT_UPDATE,
      { reportId, status: report.status, result },
    );

    return updatedReport;
  }

  // Step 3: Field verification
  async performFieldVerification(
    reportId: string,
    verifierId: string,
    verifierRole: string,
    result: 'confirmed_suspected' | 'not_disease',
    note?: string,
  ): Promise<Report> {
    const report = await this.findOne(reportId);

    const previousStatus = report.status;
    report.fieldVerifierId = verifierId;
    report.fieldVerifiedAt = new Date();
    report.fieldVerificationNote = note || '';
    report.fieldVerificationResult = result;

    if (result === 'not_disease') {
      report.status = ReportStatus.REJECTED;
    } else {
      report.status = ReportStatus.CONFIRMED;
    }

    const updatedReport = await this.reportRepository.save(report);

    await this.logStatusChange(
      reportId,
      previousStatus,
      report.status,
      verifierId,
      verifierRole,
      note,
      { result },
    );

    const resultMessages = {
      confirmed_suspected:
        'Kết quả kiểm tra thực địa: Nghi ngờ ca bệnh. Đang chờ xác nhận chính thức.',
      not_disease: `Kết quả kiểm tra: Không liên quan đến dịch bệnh.${note ? ` Ghi chú: ${note}` : ''}`,
    };

    await this.notificationService.sendToUser(
      report.userId,
      result === 'not_disease'
        ? 'Kết quả kiểm tra thực địa'
        : 'Cập nhật báo cáo',
      resultMessages[result],
      NotificationType.REPORT_UPDATE,
      { reportId, status: report.status, result },
    );

    return updatedReport;
  }

  // Step 4: Official confirmation (CDC / Ministry)
  async performOfficialConfirmation(
    reportId: string,
    confirmerId: string,
    confirmerRole: string,
    classification: 'suspected' | 'probable' | 'confirmed' | 'false_alarm',
    note?: string,
    _createCase?: boolean,
  ): Promise<{ report: Report; case?: any }> {
    const report = await this.findOne(reportId);

    const previousStatus = report.status;
    report.officialConfirmBy = confirmerId;
    report.officialConfirmAt = new Date();
    report.officialConfirmNote = note || '';
    report.officialClassification = classification;

    if (classification === 'false_alarm') {
      report.status = ReportStatus.REJECTED;
    } else {
      // Keep approved reports in publication queue until official publishing flow is completed.
      report.status = ReportStatus.PENDING;
    }

    const updatedReport = await this.reportRepository.save(report);

    await this.logStatusChange(
      reportId,
      previousStatus,
      report.status,
      confirmerId,
      confirmerRole,
      note,
      { classification },
    );

    let createdCase: any = undefined;

    // Optional: create a case on the GIS map.
    // Business rule: only allow creating a case from a detailed report.
    if (
      _createCase &&
      report.isDetailedReport &&
      classification !== 'false_alarm'
    ) {
      const lat = Number(report.latitude);
      const lon = Number(report.longitude);
      const hasValidCoords =
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180 &&
        !(lat === 0 && lon === 0);

      if (!hasValidCoords) {
        throw new BadRequestException(
          'Không thể tạo ca bệnh vì tọa độ báo cáo không hợp lệ',
        );
      }

      const severityMap: Record<string, number> = {
        low: 1,
        medium: 1,
        high: 2,
        critical: 3,
      };

      const patientName =
        report.patientInfo?.fullName || report.reporterName || undefined;
      const patientAge =
        typeof report.patientInfo?.age === 'number'
          ? report.patientInfo?.age
          : undefined;
      const patientGender = report.patientInfo?.gender || undefined;

      const evidenceCount =
        (report.imageUrls?.length || 0) +
        (report.testResultImageUrls?.length || 0) +
        (report.medicalCertImageUrls?.length || 0);

      createdCase = await this.gisService.createCase({
        disease_type: report.diseaseType,
        status: 'suspected',
        severity: severityMap[String(report.severityLevel || 'medium')] || 1,
        reported_time: (report.createdAt || new Date()).toISOString(),
        lat,
        lon,
        patient_name: patientName,
        patient_age: patientAge,
        patient_gender: patientGender,
        notes:
          `From report ${report.id}. ` +
          `Official classification: ${classification}. ` +
          `Evidence images: ${evidenceCount}. ` +
          (note ? `Official note: ${note}` : ''),
      });
    }

    const classLabels = {
      suspected: 'Nghi ngờ',
      probable: 'Có thể',
      confirmed: 'Xác nhận',
      false_alarm: 'Báo động giả',
    };

    await this.notificationService.sendToUser(
      report.userId,
      `Kết quả xác nhận chính thức: ${classLabels[classification]}`,
      classification === 'false_alarm'
        ? `Báo cáo về ${report.diseaseType} được xác nhận là báo động giả.${note ? ` Ghi chú: ${note}` : ''}`
        : `Báo cáo về ${report.diseaseType} đã qua duyệt và đang ở hàng chờ công bố chính thức.${note ? ` Ghi chú: ${note}` : ''}`,
      NotificationType.REPORT_UPDATE,
      { reportId, status: report.status, classification },
    );

    return { report: updatedReport, case: createdCase };
  }

  // Step 5: Close report
  async closeReport(
    reportId: string,
    closerId: string,
    closerRole: string,
    action: 'monitoring' | 'isolation' | 'area_warning' | 'no_action',
    note?: string,
  ): Promise<Report> {
    const report = await this.findOne(reportId);

    const previousStatus = report.status;
    report.closedAt = new Date();
    report.closedBy = closerId;
    report.closureNote = note || '';
    report.closureAction = action;
    report.status = ReportStatus.CLOSED;

    const updatedReport = await this.reportRepository.save(report);

    await this.logStatusChange(
      reportId,
      previousStatus,
      ReportStatus.CLOSED,
      closerId,
      closerRole,
      note,
      { action },
    );

    const actionLabels = {
      monitoring: 'Theo dõi',
      isolation: 'Cách ly',
      area_warning: 'Cảnh báo khu vực',
      no_action: 'Không hành động',
    };

    await this.notificationService.sendToUser(
      report.userId,
      'Báo cáo đã được xử lý hoàn tất',
      `Báo cáo của bạn đã được xử lý. Hành động: ${actionLabels[action]}.${note ? ` Ghi chú: ${note}` : ''}`,
      NotificationType.REPORT_UPDATE,
      { reportId, status: ReportStatus.CLOSED, action },
    );

    return updatedReport;
  }

  // Get status history for a report
  async getStatusHistory(reportId: string): Promise<ReportStatusHistory[]> {
    return this.statusHistoryRepository.find({
      where: { reportId },
      order: { createdAt: 'ASC' },
    });
  }

  async findAll(queryDto: QueryReportDto): Promise<{
    data: Report[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      diseaseType,
      startDate,
      endDate,
    } = queryDto;

    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.user', 'user')
      .orderBy('report.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('report.status = :status', { status });
    }

    if (diseaseType) {
      queryBuilder.andWhere('report.diseaseType = :diseaseType', {
        diseaseType,
      });
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

  async findNearby(
    lat: number,
    lon: number,
    radiusKm: number = 5,
  ): Promise<Report[]> {
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
        statuses: [
          ReportStatus.CONFIRMED,
          ReportStatus.PENDING,
          ReportStatus.VERIFIED,
        ],
      })
      .andWhere('report.reportType = :reportType', {
        reportType: 'case_report',
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

    if (!isAdmin && report.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật báo cáo này');
    }

    if (!isAdmin) {
      delete updateReportDto.status;
      delete updateReportDto.adminNote;
    }

    Object.assign(report, updateReportDto);
    return this.reportRepository.save(report);
  }

  // Legacy status update (backward compatible)
  async updateStatus(
    id: string,
    adminId: string,
    status: ReportStatus,
    adminNote?: string,
    _createCase?: boolean,
  ): Promise<{ report: Report; case?: any }> {
    const report = await this.findOne(id);

    const previousStatus = report.status;
    if (status === ReportStatus.VERIFIED || status === ReportStatus.CONFIRMED) {
      report.status = ReportStatus.PENDING;
    } else {
      report.status = status;
    }
    if (adminNote !== undefined) {
      report.adminNote = adminNote;
    }
    report.verifiedAt = new Date();
    report.verifiedBy = adminId;

    const updatedReport = await this.reportRepository.save(report);

    await this.logStatusChange(
      id,
      previousStatus,
      report.status,
      adminId,
      'admin',
      adminNote,
    );

    let createdCase: any = undefined;

    // Legacy: allow creating case only for detailed reports.
    if (
      _createCase &&
      report.isDetailedReport &&
      (status === ReportStatus.VERIFIED || status === ReportStatus.CONFIRMED)
    ) {
      const lat = Number(report.latitude);
      const lon = Number(report.longitude);
      const hasValidCoords =
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180 &&
        !(lat === 0 && lon === 0);

      if (!hasValidCoords) {
        throw new BadRequestException(
          'Không thể tạo ca bệnh vì tọa độ báo cáo không hợp lệ',
        );
      }

      const severityMap: Record<string, number> = {
        low: 1,
        medium: 1,
        high: 2,
        critical: 3,
      };

      const evidenceCount =
        (report.imageUrls?.length || 0) +
        (report.testResultImageUrls?.length || 0) +
        (report.medicalCertImageUrls?.length || 0);

      createdCase = await this.gisService.createCase({
        disease_type: report.diseaseType,
        status: 'suspected',
        severity: severityMap[String(report.severityLevel || 'medium')] || 1,
        reported_time: (report.createdAt || new Date()).toISOString(),
        lat,
        lon,
        patient_name:
          report.patientInfo?.fullName || report.reporterName || undefined,
        patient_age:
          typeof report.patientInfo?.age === 'number'
            ? report.patientInfo?.age
            : undefined,
        patient_gender: report.patientInfo?.gender || undefined,
        notes:
          `From report ${report.id}. ` +
          `Evidence images: ${evidenceCount}. ` +
          (adminNote ? `Admin note: ${adminNote}` : ''),
      });
    }

    if (report.userId) {
      const statusMessages = {
        [ReportStatus.VERIFIED]: {
          title: 'Báo cáo đã được xác minh',
          body: `Báo cáo của bạn về ${report.diseaseType} đã được duyệt và đang chờ công bố chính thức.`,
        },
        [ReportStatus.CONFIRMED]: {
          title: 'Báo cáo đã được xác nhận',
          body: `Báo cáo của bạn về ${report.diseaseType} đã được duyệt và đang chờ công bố chính thức.`,
        },
        [ReportStatus.REJECTED]: {
          title: 'Báo cáo không được chấp nhận',
          body: `Báo cáo của bạn về ${report.diseaseType} không được chấp nhận.${adminNote ? ` Lý do: ${adminNote}` : ''}`,
        },
        [ReportStatus.RESOLVED]: {
          title: 'Báo cáo đã được xử lý',
          body: `Báo cáo của bạn về ${report.diseaseType} đã được xử lý xong.`,
        },
        [ReportStatus.CLOSED]: {
          title: 'Báo cáo đã hoàn tất',
          body: `Báo cáo của bạn về ${report.diseaseType} đã được xử lý hoàn tất.`,
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
            status: report.status,
            diseaseType: report.diseaseType,
          },
        );
      }
    }

    return { report: updatedReport, case: createdCase };
  }

  async remove(
    id: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<void> {
    const report = await this.findOne(id);

    if (!isAdmin && report.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa báo cáo này');
    }

    await this.reportRepository.remove(report);
  }

  async getStats(): Promise<{
    total: number;
    submitted: number;
    autoVerified: number;
    underReview: number;
    fieldVerification: number;
    confirmed: number;
    rejected: number;
    closed: number;
    pending: number;
    verified: number;
    byDisease: Record<string, number>;
    byReportType: Record<string, number>;
  }> {
    const total = await this.reportRepository.count();
    const submitted = await this.reportRepository.count({
      where: { status: ReportStatus.SUBMITTED },
    });
    const autoVerified = await this.reportRepository.count({
      where: { status: ReportStatus.AUTO_VERIFIED },
    });
    const underReview = await this.reportRepository.count({
      where: { status: ReportStatus.UNDER_REVIEW },
    });
    const fieldVerification = await this.reportRepository.count({
      where: { status: ReportStatus.FIELD_VERIFICATION },
    });
    const confirmed = await this.reportRepository.count({
      where: { status: ReportStatus.CONFIRMED },
    });
    const rejected = await this.reportRepository.count({
      where: { status: ReportStatus.REJECTED },
    });
    const closed = await this.reportRepository.count({
      where: { status: ReportStatus.CLOSED },
    });
    const pending = await this.reportRepository.count({
      where: { status: ReportStatus.PENDING },
    });
    const verified = await this.reportRepository.count({
      where: { status: ReportStatus.VERIFIED },
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

    const byTypeRaw = await this.reportRepository
      .createQueryBuilder('report')
      .select('report.reportType', 'reportType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('report.reportType')
      .getRawMany();

    const byReportType = byTypeRaw.reduce(
      (acc, item) => {
        acc[item.reportType || 'case_report'] = parseInt(item.count);
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      submitted,
      autoVerified,
      underReview,
      fieldVerification,
      confirmed,
      rejected,
      closed,
      pending,
      verified,
      byDisease,
      byReportType,
    };
  }
}
