import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  disease_type?: string;

  @IsOptional()
  @IsIn([
    'suspected',
    'probable',
    'confirmed',
    'under treatment',
    'under observation',
    'recovered',
    'deceased',
  ])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  severity?: number;

  @IsOptional()
  @IsString()
  reported_time?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lon?: number;

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
}
