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
import { RiskLevel } from '../entities/epidemic-zone.entity';

export class CreateZoneDto {
  @IsString()
  name: string;

  @IsString()
  diseaseType: string;

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
  @IsDateString()
  startDate?: string;
}
