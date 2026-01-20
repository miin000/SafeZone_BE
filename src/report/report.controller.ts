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
import { UpdateStatusDto } from './dto/update-status.dto';
import { PhoneVerifiedGuard } from '../auth/guards/phone-verified.guard';

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  // Creating reports only requires phone verification
  @UseGuards(AuthGuard('jwt'), PhoneVerifiedGuard)
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

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
  ) {
    const isAdmin = req.user.role === 'admin';
    return this.reportService.update(id, req.user.id, updateReportDto, isAdmin);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    // TODO: Add admin guard
    return this.reportService.updateStatus(
      id,
      req.user.id,
      updateStatusDto.status,
      updateStatusDto.adminNote,
      updateStatusDto.createCase,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    const isAdmin = req.user.role === 'admin';
    return this.reportService.remove(id, req.user.id, isAdmin);
  }
}
