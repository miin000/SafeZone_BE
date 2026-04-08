import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import {
  RiskLevel,
  ZoneLifecycleStatus,
  ZoneSource,
} from '../entities/epidemic-zone.entity';

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  diseaseType?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  radiusKm?: number;

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
  @IsString()
  reviewNote?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
