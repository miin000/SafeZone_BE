import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import {
  UpdateStatusDto,
  PreliminaryReviewDto,
  FieldVerificationDto,
  OfficialConfirmationDto,
  CloseReportDto,
} from './dto/update-status.dto';
import { VerifiedGuard } from '../auth/guards/verified.guard';
import { AuditLogService } from '../admin/audit-log.service';
import { AuditAction, AuditResource } from '../admin/entities/audit-log.entity';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Creating reports requires both email and phone verification
  @UseGuards(AuthGuard('jwt'), VerifiedGuard)
  @Post()
  async create(@Request() req, @Body() createReportDto: CreateReportDto) {
    return this.reportService.create(req.user.id, createReportDto);
  }

  @Get()
  async findAll(@Query() queryDto: QueryReportDto) {
    return this.reportService.findAll(queryDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-reports')
  async findMyReports(@Request() req) {
    return this.reportService.findByUser(req.user.id);
  }

  @Get('nearby')
  async findNearby(
    @Query('lat') lat: number,
    @Query('lon') lon: number,
    @Query('radius') radius: number = 5,
  ) {
    return this.reportService.findNearby(lat, lon, radius);
  }

  @Get('stats')
  async getStats() {
    return this.reportService.getStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.reportService.findOne(id);
  }

  // Get status history for a report
  @UseGuards(AuthGuard('jwt'))
  @Get(':id/history')
  async getStatusHistory(@Param('id') id: string) {
    return this.reportService.getStatusHistory(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
  ) {
    const isAdmin =
      req.user.role === 'admin' || req.user.role === 'health_authority';
    return this.reportService.update(id, req.user.id, updateReportDto, isAdmin);
  }

  // Legacy status update (backward compatible)
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    const result = await this.reportService.updateStatus(
      id,
      req.user.id,
      updateStatusDto.status,
      updateStatusDto.adminNote,
      updateStatusDto.createCase,
    );

    const action =
      updateStatusDto.status === 'verified' ||
      updateStatusDto.status === 'confirmed'
        ? AuditAction.APPROVE
        : updateStatusDto.status === 'rejected'
          ? AuditAction.REJECT
          : AuditAction.UPDATE;

    this.auditLogService.log(
      req.user.id,
      action,
      AuditResource.REPORT,
      id,
      `Status → ${updateStatusDto.status} for report #${id}`,
      {
        status: updateStatusDto.status,
        adminNote: updateStatusDto.adminNote,
        createCase: updateStatusDto.createCase,
      },
    );

    return result;
  }

  // Step 2: Preliminary review by local health authority
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/preliminary-review')
  async preliminaryReview(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: PreliminaryReviewDto,
  ) {
    const result = await this.reportService.performPreliminaryReview(
      id,
      req.user.id,
      req.user.role,
      dto.result,
      dto.note,
    );

    this.auditLogService.log(
      req.user.id,
      dto.result === 'invalid' ? AuditAction.REJECT : AuditAction.APPROVE,
      AuditResource.REPORT,
      id,
      `Preliminary review: ${dto.result} for report #${id}`,
      { result: dto.result, note: dto.note },
    );

    return result;
  }

  // Step 3: Field verification
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/field-verify')
  async fieldVerify(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: FieldVerificationDto,
  ) {
    const result = await this.reportService.performFieldVerification(
      id,
      req.user.id,
      req.user.role,
      dto.result,
      dto.note,
    );

    this.auditLogService.log(
      req.user.id,
      dto.result === 'not_disease' ? AuditAction.REJECT : AuditAction.APPROVE,
      AuditResource.REPORT,
      id,
      `Field verification: ${dto.result} for report #${id}`,
      { result: dto.result, note: dto.note },
    );

    return result;
  }

  // Step 4: Official confirmation (CDC / Ministry)
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/official-confirm')
  async officialConfirm(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: OfficialConfirmationDto,
  ) {
    const result = await this.reportService.performOfficialConfirmation(
      id,
      req.user.id,
      req.user.role,
      dto.classification,
      dto.note,
      dto.createCase,
    );

    this.auditLogService.log(
      req.user.id,
      dto.classification === 'false_alarm'
        ? AuditAction.REJECT
        : AuditAction.APPROVE,
      AuditResource.REPORT,
      id,
      `Official confirmation: ${dto.classification} for report #${id}`,
      {
        classification: dto.classification,
        note: dto.note,
        createCase: dto.createCase,
      },
    );

    return result;
  }

  // Step 5: Close report
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/close')
  async closeReport(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CloseReportDto,
  ) {
    const result = await this.reportService.closeReport(
      id,
      req.user.id,
      req.user.role,
      dto.action,
      dto.note,
    );

    this.auditLogService.log(
      req.user.id,
      AuditAction.UPDATE,
      AuditResource.REPORT,
      id,
      `Closed report #${id} with action: ${dto.action}`,
      { action: dto.action, note: dto.note },
    );

    return result;
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    const isAdmin =
      req.user.role === 'admin' || req.user.role === 'health_authority';
    return this.reportService.remove(id, req.user.id, isAdmin);
  }
}
