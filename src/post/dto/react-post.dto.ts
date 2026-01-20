import { IsEnum } from 'class-validator';
import { ReactionType } from '../entities/post-reaction.entity';

export class ReactPostDto {
  @IsEnum(ReactionType, { message: 'Loại reaction không hợp lệ' })
  type: ReactionType;
}
