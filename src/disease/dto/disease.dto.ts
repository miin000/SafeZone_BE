import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { DiseaseRiskLevel } from '../entities/disease.entity';

export class CreateDiseaseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DiseaseRiskLevel)
  riskLevel?: DiseaseRiskLevel;

  @IsOptional()
  @IsString()
  aliases?: string;

  @IsOptional()
  @IsString()
  icdCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDiseaseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DiseaseRiskLevel)
  riskLevel?: DiseaseRiskLevel;

  @IsOptional()
  @IsString()
  aliases?: string;

  @IsOptional()
  @IsString()
  icdCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
