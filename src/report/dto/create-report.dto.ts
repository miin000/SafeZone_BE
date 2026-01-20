import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PatientInfoDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsString()
  idNumber?: string; // CCCD/CMND

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  workplace?: string;

  @IsOptional()
  @IsDateString()
  symptomOnsetDate?: string; // Ngày khởi phát triệu chứng

  @IsOptional()
  @IsString()
  healthFacility?: string; // Cơ sở y tế điều trị

  @IsOptional()
  @IsBoolean()
  isHospitalized?: boolean;

  @IsOptional()
  @IsString()
  travelHistory?: string; // Lịch sử di chuyển

  @IsOptional()
  @IsString()
  contactHistory?: string; // Lịch sử tiếp xúc

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  underlyingConditions?: string[]; // Bệnh nền
}

export class CreateReportDto {
  @IsString()
  diseaseType: string;

  @IsString()
  description: string;

  // Case/incident location (where the case occurred)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  // Reporter's current location (who is reporting)
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  reporterLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  reporterLon?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  affectedCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  // Detailed case report fields
  @IsOptional()
  @IsBoolean()
  isDetailedReport?: boolean; // Flag to identify detailed reports

  @IsOptional()
  @ValidateNested()
  @Type(() => PatientInfoDto)
  patientInfo?: PatientInfoDto; // Detailed patient information
}
