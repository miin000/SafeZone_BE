import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsUrl,
  MinLength,
} from 'class-validator';
import { HealthInfoCategory } from '../entities/health-info.entity';

export class CreateHealthInfoDto {
  @IsString()
  @MinLength(5, { message: 'Tiêu đề phải có ít nhất 5 ký tự' })
  title: string;

  @IsString()
  @MinLength(20, { message: 'Nội dung phải có ít nhất 20 ký tự' })
  content: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsEnum(HealthInfoCategory)
  category: HealthInfoCategory;

  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  sourceName?: string;
}
