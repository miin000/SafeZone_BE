import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateHealthInfoDto } from './create-health-info.dto';
import { HealthInfoStatus } from '../entities/health-info.entity';

export class UpdateHealthInfoDto extends PartialType(CreateHealthInfoDto) {
  @IsOptional()
  @IsEnum(HealthInfoStatus)
  status?: HealthInfoStatus;
}
