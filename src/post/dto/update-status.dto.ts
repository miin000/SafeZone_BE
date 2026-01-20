import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PostStatus } from '../entities/post.entity';

export class UpdatePostStatusDto {
  @IsEnum(PostStatus, { message: 'Trạng thái không hợp lệ' })
  status: PostStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
