import { Controller, Get, Post, Put, Delete, Query, Param, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GisService } from './gis.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { AuditLogService } from '../admin/audit-log.service';
import { AuditAction, AuditResource } from '../admin/entities/audit-log.entity';

@Controller('gis')
export class GisController {
  constructor(
    private readonly gisService: GisService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('regions')
  getRegions() {
    return this.gisService.getRegionsGeoJSON();
  }

  @Get('cases')
  getCases(
    @Query('diseaseType') diseaseType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gisService.getCasesGeoJSON({ diseaseType, status, from, to });
  }

  @Get('cases/list')
  getCasesList(
    @Query('diseaseType') diseaseType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.gisService.getCasesList({
      diseaseType,
      status,
      from,
      to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
    });
  }

  @Get('cases/:id')
  async getCaseById(@Param('id') id: string, @Req() req: any) {
    const caseData = await this.gisService.getCaseById(id);
    
    // Log view action if user is authenticated
    if (req.user) {
      this.auditLogService.log(
        req.user.id,
        AuditAction.VIEW,
        AuditResource.CASE,
        id,
        `Viewed case #${id}`,
      );
    }
    
    return caseData;
  }

  @Post('cases')
  @UseGuards(AuthGuard('jwt'))
  async createCase(@Body() dto: CreateCaseDto, @Req() req: any) {
    const newCase = await this.gisService.createCase(dto);
    
    // Log create action
    this.auditLogService.log(
      req.user.id,
      AuditAction.CREATE,
      AuditResource.CASE,
      String(newCase.id),
      `Created new case: ${dto.disease_type}`,
      { disease_type: dto.disease_type, severity: dto.severity },
    );
    
    return newCase;
  }

  @Put('cases/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateCase(@Param('id') id: string, @Body() dto: UpdateCaseDto, @Req() req: any) {
    const updated = await this.gisService.updateCase(id, dto);
    
    // Log update action
    this.auditLogService.log(
      req.user.id,
      AuditAction.UPDATE,
      AuditResource.CASE,
      id,
      `Updated case #${id}`,
      { changes: dto },
    );
    
    return updated;
  }

  @Delete('cases/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteCase(@Param('id') id: string, @Req() req: any) {
    const result = await this.gisService.deleteCase(id);
    
    // Log delete action
    this.auditLogService.log(
      req.user.id,
      AuditAction.DELETE,
      AuditResource.CASE,
      id,
      `Deleted case #${id}`,
    );
    
    return result;
  }

  @Get('stats')
  getStats(
    @Query('diseaseType') diseaseType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gisService.getStats({ diseaseType, status, from, to });
  }

  @Get('grid-density')
  getGridDensity(
    @Query('diseaseType') diseaseType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('gridSize') gridSize?: string,
    @Query('north') north?: string,
    @Query('south') south?: string,
    @Query('east') east?: string,
    @Query('west') west?: string,
  ) {
    const bounds = north && south && east && west
      ? {
          north: parseFloat(north),
          south: parseFloat(south),
          east: parseFloat(east),
          west: parseFloat(west),
        }
      : undefined;

    return this.gisService.getGridDensity({
      diseaseType,
      status,
      from,
      to,
      gridSize: gridSize ? parseFloat(gridSize) : 0.1,
      bounds,
    });
  }

  @Get('clusters')
  getClusteredCases(
    @Query('diseaseType') diseaseType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clusterDistance') clusterDistance?: string,
  ) {
    return this.gisService.getClusteredCases({
      diseaseType,
      status,
      from,
      to,
      clusterDistance: clusterDistance ? parseFloat(clusterDistance) : 0.05,
    });
  }

  @Get('reverse-geocode')
  reverseGeocode(
    @Query('lat') lat: string,
    @Query('lon') lon: string,
  ) {
    return this.gisService.reverseGeocode(
      parseFloat(lat),
      parseFloat(lon),
    );
  }
}
