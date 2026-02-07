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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { ZoneService } from './zone.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { NotificationService } from '../notification/notification.service';

@Controller('zones')
export class ZoneController {
  constructor(
    private readonly zoneService: ZoneService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async create(@Body() createZoneDto: CreateZoneDto) {
    return this.zoneService.create(createZoneDto);
  }

  @Get()
  async findAll(@Query('all') all: string) {
    return this.zoneService.findAll(all !== 'true');
  }

  @Get('nearby')
  async findNearby(
    @Query('lat') lat: number,
    @Query('lon') lon: number,
    @Query('radius') radius: number = 10,
  ) {
    return this.zoneService.findNearby(lat, lon, radius);
  }

  @Get('check')
  async checkPointInZone(@Query('lat') lat: number, @Query('lon') lon: number) {
    const zones = await this.zoneService.checkPointInZone(lat, lon);
    return {
      inZone: zones.length > 0,
      zones,
    };
  }

  /**
   * Check if user is in danger zone and send push notification alert
   * Should be called periodically from mobile app when location changes
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('check-location')
  async checkLocationAndAlert(
    @Request() req,
    @Body('lat') lat: number,
    @Body('lon') lon: number,
  ) {
    const userId = req.user.sub;
    const zones = await this.zoneService.checkPointInZone(lat, lon);
    
    if (zones.length > 0) {
      // User is in danger zone - send push notification
      const highestRiskZone = zones[0]; // Zones are sorted by risk level DESC
      
      await this.notificationService.sendZoneEntryAlert(
        userId,
        highestRiskZone.name,
        highestRiskZone.diseaseType,
        highestRiskZone.riskLevel as 'low' | 'medium' | 'high' | 'critical',
        highestRiskZone.id,
      );
    }

    return {
      inZone: zones.length > 0,
      zones,
      alertSent: zones.length > 0,
    };
  }

  @Get('stats')
  async getStats() {
    return this.zoneService.getStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.zoneService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async update(@Param('id') id: string, @Body() updateZoneDto: UpdateZoneDto) {
    return this.zoneService.update(id, updateZoneDto);
  }

  @Patch(':id/deactivate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async deactivate(@Param('id') id: string) {
    return this.zoneService.deactivate(id);
  }

  @Patch(':id/case-count')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async updateCaseCount(
    @Param('id') id: string,
    @Body('caseCount') caseCount: number,
  ) {
    return this.zoneService.updateCaseCount(id, caseCount);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    return this.zoneService.remove(id);
  }
}
