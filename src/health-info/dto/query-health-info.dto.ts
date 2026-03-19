import { IsOptional, IsEnum, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  HealthInfoCategory,
  HealthInfoStatus,
  HealthInfoDiseaseType,
  HealthInfoTarget,
  HealthInfoSeverity,
} from '../entities/health-info.entity';

export class QueryHealthInfoDto {
  @IsOptional()
  @IsEnum(HealthInfoCategory)
  category?: HealthInfoCategory;

  @IsOptional()
  @IsEnum(HealthInfoStatus)
  status?: HealthInfoStatus;

  @IsOptional()
  @IsEnum(HealthInfoDiseaseType)
  diseaseType?: HealthInfoDiseaseType;

  @IsOptional()
  @IsEnum(HealthInfoTarget)
  target?: HealthInfoTarget;

  @IsOptional()
  @IsEnum(HealthInfoSeverity)
  severityLevel?: HealthInfoSeverity;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
