import { Controller, Get, Post, Put, Delete, Query, Param, Body } from '@nestjs/common';
import { GisService } from './gis.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

@Controller('gis')
export class GisController {
  constructor(private readonly gisService: GisService) {}

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
  getCaseById(@Param('id') id: string) {
    return this.gisService.getCaseById(id);
  }

  @Post('cases')
  createCase(@Body() dto: CreateCaseDto) {
    return this.gisService.createCase(dto);
  }

  @Put('cases/:id')
  updateCase(@Param('id') id: string, @Body() dto: UpdateCaseDto) {
    return this.gisService.updateCase(id, dto);
  }

  @Delete('cases/:id')
  deleteCase(@Param('id') id: string) {
    return this.gisService.deleteCase(id);
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
