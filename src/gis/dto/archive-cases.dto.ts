import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ArchiveCasesDto {
  @IsOptional()
  @IsString()
  diseaseType?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  outbreakId?: string;
}
