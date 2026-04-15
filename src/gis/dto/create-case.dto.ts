import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateCaseDto {
  @IsNotEmpty()
  @IsString()
  disease_type: string;

  // Optional: prefer catalog FK when available (backward compatible)
  @IsOptional()
  @IsUUID()
  disease_id?: string;

  // Compatibility for camelCase clients
  @IsOptional()
  @IsUUID()
  diseaseId?: string;

  @IsNotEmpty()
  @IsIn([
    'suspected',
    'probable',
    'confirmed',
    'under treatment',
    'under observation',
    'recovered',
    'deceased',
  ])
  status: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  severity?: number;

  @IsNotEmpty()
  @IsString()
  reported_time: string;

  @IsNotEmpty()
  @IsNumber()
  lat: number;

  @IsNotEmpty()
  @IsNumber()
  lon: number;

  @IsOptional()
  @IsInt()
  region_id?: number;

  @IsOptional()
  @IsString()
  patient_name?: string;

  @IsOptional()
  @IsInt()
  patient_age?: number;

  @IsOptional()
  @IsString()
  patient_gender?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  outbreak_id?: string;
}
