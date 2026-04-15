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
  IsUUID,
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
  @IsNumber()
  yearOfBirth?: number;

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
  symptomOnsetDate?: string;

  @IsOptional()
  @IsString()
  healthFacility?: string;

  @IsOptional()
  @IsBoolean()
  isHospitalized?: boolean;

  @IsOptional()
  @IsString()
  travelHistory?: string;

  @IsOptional()
  @IsString()
  contactHistory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  underlyingConditions?: string[];
}

export class CreateReportDto {
  // Report type: case_report or outbreak_alert
  @IsOptional()
  @IsEnum(['case_report', 'outbreak_alert'])
  reportType?: 'case_report' | 'outbreak_alert';

  @IsString()
  diseaseType: string;

  // Optional: prefer catalog FK
  @IsOptional()
  @IsUUID()
  diseaseId?: string;

  @IsString()
  description: string;

  // Case/incident location
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  // Reporter's current location
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

  // Severity level
  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severityLevel?: 'low' | 'medium' | 'high' | 'critical';

  // Case report fields
  @IsOptional()
  @IsBoolean()
  isDetailedReport?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatientInfoDto)
  patientInfo?: PatientInfoDto;

  // Is the reporter the patient?
  @IsOptional()
  @IsBoolean()
  isSelfReport?: boolean;

  // Reporter info
  @IsOptional()
  @IsString()
  reporterName?: string;

  @IsOptional()
  @IsString()
  reporterPhone?: string;

  // Epidemiological info
  @IsOptional()
  @IsBoolean()
  hasContactWithPatient?: boolean;

  @IsOptional()
  @IsBoolean()
  hasVisitedEpidemicArea?: boolean;

  @IsOptional()
  @IsBoolean()
  hasSimilarCasesNearby?: boolean;

  @IsOptional()
  @IsNumber()
  estimatedNearbyCount?: number;

  // Medical visit
  @IsOptional()
  @IsBoolean()
  hasVisitedDoctor?: boolean;

  @IsOptional()
  @IsBoolean()
  hasTestResult?: boolean;

  @IsOptional()
  @IsString()
  testResultDescription?: string;

  // Evidence
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testResultImageUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalCertImageUrls?: string[];

  // Outbreak alert fields
  @IsOptional()
  @IsString()
  locationDescription?: string;

  @IsOptional()
  @IsEnum(['school', 'factory', 'residential', 'market', 'hospital', 'other'])
  locationType?: string;

  @IsOptional()
  @IsString()
  suspectedDisease?: string;

  @IsOptional()
  @IsString()
  outbreakDescription?: string;

  @IsOptional()
  @IsDateString()
  discoveryTime?: string;

  // Consent
  @IsOptional()
  @IsBoolean()
  reporterConsent?: boolean;

  // Device ID for anti-spam
  @IsOptional()
  @IsString()
  deviceId?: string;
}
