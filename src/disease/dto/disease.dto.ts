import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import {
  CirculationLevel,
  TransmissionRoute,
} from '../disease-scoring';

export class CreateDiseaseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  nameVi?: string;

  // Backward/compat: allow snake_case from some clients
  @IsOptional()
  @IsString()
  name_vi?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  aliases?: string;

  @IsOptional()
  @IsString()
  icdCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsNumber()
  @Min(0)
  @Max(100)
  caseFatalityRate: number;

  @IsArray()
  @IsEnum(TransmissionRoute, { each: true })
  transmissionRoutes: TransmissionRoute[];

  @IsNumber()
  @Min(0)
  r0: number;

  @IsBoolean()
  hasVaccine: boolean;

  @IsBoolean()
  hasSpecificTreatment: boolean;

  @IsEnum(CirculationLevel)
  circulationLevel: CirculationLevel;

  @IsBoolean()
  isNovelSpecialDangerous: boolean;

  @IsOptional()
  @IsString()
  scoringNotes?: string;
}

export class UpdateDiseaseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameVi?: string;

  // Backward/compat: allow snake_case from some clients
  @IsOptional()
  @IsString()
  name_vi?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  aliases?: string;

  @IsOptional()
  @IsString()
  icdCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  caseFatalityRate?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(TransmissionRoute, { each: true })
  transmissionRoutes?: TransmissionRoute[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  r0?: number;

  @IsOptional()
  @IsBoolean()
  hasVaccine?: boolean;

  @IsOptional()
  @IsBoolean()
  hasSpecificTreatment?: boolean;

  @IsOptional()
  @IsEnum(CirculationLevel)
  circulationLevel?: CirculationLevel;

  @IsOptional()
  @IsBoolean()
  isNovelSpecialDangerous?: boolean;

  @IsOptional()
  @IsString()
  scoringNotes?: string;
}
