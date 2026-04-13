import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GisService } from './gis.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { ArchiveCasesDto } from './dto/archive-cases.dto';
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
    @Query('outbreakId') outbreakId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.gisService.getCasesGeoJSON({
      diseaseType,
      status,
      from,
      to,
      outbreakId,
      includeArchived: includeArchived === '1' || includeArchived === 'true',
    });
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
    @Query('outbreakId') outbreakId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.gisService.getCasesList({
      diseaseType,
      status,
      from,
      to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
      outbreakId,
      includeArchived: includeArchived === '1' || includeArchived === 'true',
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
  async updateCase(
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
    @Req() req: any,
  ) {
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

  // Admin: bulk archive cases so they stop showing on map by default
  @Post('cases/archive')
  @UseGuards(AuthGuard('jwt'))
  async archiveCases(@Body() dto: ArchiveCasesDto, @Req() req: any) {
    const result = await this.gisService.archiveCases(dto);

    this.auditLogService.log(
      req.user.id,
      AuditAction.UPDATE,
      AuditResource.CASE,
      'bulk',
      `Archived cases (bulk)`,
      { filter: dto, affected: result.affected },
    );

    return result;
  }

  // Admin: bulk unarchive cases to show them again
  @Post('cases/unarchive')
  @UseGuards(AuthGuard('jwt'))
  async unarchiveCases(@Body() dto: ArchiveCasesDto, @Req() req: any) {
    const result = await this.gisService.unarchiveCases(dto);

    this.auditLogService.log(
      req.user.id,
      AuditAction.UPDATE,
      AuditResource.CASE,
      'bulk',
      `Unarchived cases (bulk)`,
      { filter: dto, affected: result.affected },
    );

    return result;
  }

  @Get('stats')
  getStats(
    @Query('diseaseType') diseaseType?: string,
    @Query('regionName') regionName?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outbreakId') outbreakId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.gisService.getStats({
      diseaseType,
      regionName,
      status,
      from,
      to,
      outbreakId,
      includeArchived: includeArchived === '1' || includeArchived === 'true',
    });
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
    @Query('outbreakId') outbreakId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const bounds =
      north && south && east && west
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
      outbreakId,
      includeArchived: includeArchived === '1' || includeArchived === 'true',
    });
  }

  @Get('clusters')
  getClusteredCases(
    @Query('diseaseType') diseaseType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clusterDistance') clusterDistance?: string,
    @Query('clusterDistanceKm') clusterDistanceKm?: string,
    @Query('minPoints') minPoints?: string,
    @Query('includeNoise') includeNoise?: string,
    @Query('outbreakId') outbreakId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.gisService.getClusteredCases({
      diseaseType,
      status,
      from,
      to,
      clusterDistance: clusterDistance ? parseFloat(clusterDistance) : 0.05,
      clusterDistanceKm: clusterDistanceKm
        ? parseFloat(clusterDistanceKm)
        : undefined,
      minPoints: minPoints ? parseInt(minPoints, 10) : 4,
      includeNoise: includeNoise === '1' || includeNoise === 'true',
      outbreakId,
      includeArchived: includeArchived === '1' || includeArchived === 'true',
    });
  }

  @Get('reverse-geocode')
  reverseGeocode(@Query('lat') lat: string, @Query('lon') lon: string) {
    return this.gisService.reverseGeocode(parseFloat(lat), parseFloat(lon));
  }
}
