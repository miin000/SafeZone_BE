import { IsString, IsEnum, IsOptional } from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class CreateNotificationDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsOptional()
  data?: Record<string, any>;

  @IsOptional()
  @IsString()
  userId?: string;
}
