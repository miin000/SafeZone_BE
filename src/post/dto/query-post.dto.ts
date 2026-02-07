import { IsOptional, IsString, IsEnum, IsNumberString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PostStatus } from '../entities/post.entity';

export class QueryPostDto {
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @IsOptional()
  @IsString()
  diseaseType?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  showAll?: boolean;
}
