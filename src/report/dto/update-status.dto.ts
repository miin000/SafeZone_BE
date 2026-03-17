import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ReportStatus } from '../entities/report.entity';

export class UpdateStatusDto {
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsBoolean()
  createCase?: boolean;
}

// Preliminary review by local health station (Step 2)
export class PreliminaryReviewDto {
  @IsEnum(['valid', 'need_field_check', 'invalid'])
  result: 'valid' | 'need_field_check' | 'invalid';

  @IsOptional()
  @IsString()
  note?: string;
}

// Field verification (Step 3)
export class FieldVerificationDto {
  @IsEnum(['confirmed_suspected', 'not_disease'])
  result: 'confirmed_suspected' | 'not_disease';

  @IsOptional()
  @IsString()
  note?: string;
}

// Official confirmation by CDC (Step 4)
export class OfficialConfirmationDto {
  @IsEnum(['suspected', 'probable', 'confirmed', 'false_alarm'])
  classification: 'suspected' | 'probable' | 'confirmed' | 'false_alarm';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  createCase?: boolean;
}

// Close report (Step 5)
export class CloseReportDto {
  @IsEnum(['monitoring', 'isolation', 'area_warning', 'no_action'])
  action: 'monitoring' | 'isolation' | 'area_warning' | 'no_action';

  @IsOptional()
  @IsString()
  note?: string;
}
