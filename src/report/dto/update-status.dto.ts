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
