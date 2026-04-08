import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ProposeZonesDbscanDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diseaseTypes?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  epsKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  minPoints?: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(500)
  minClusterCases?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;
}
