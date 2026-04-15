import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  IsDateString,
  IsUUID,
} from 'class-validator';
import {
  RiskLevel,
  ZoneLifecycleStatus,
  ZoneSource,
} from '../entities/epidemic-zone.entity';

export class CreateZoneDto {
  @IsString()
  name: string;

  @IsString()
  diseaseType: string;

  @IsOptional()
  @IsUUID()
  diseaseId?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  @IsNumber()
  @Min(0.1)
  radiusKm: number;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  caseCount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(ZoneLifecycleStatus)
  lifecycleStatus?: ZoneLifecycleStatus;

  @IsOptional()
  @IsEnum(ZoneSource)
  source?: ZoneSource;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  proposalConfidence?: number;

  @IsOptional()
  proposedBy?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}
