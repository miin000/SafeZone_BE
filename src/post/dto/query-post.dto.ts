import { IsOptional, IsString, IsEnum, IsNumberString } from 'class-validator';
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
}
