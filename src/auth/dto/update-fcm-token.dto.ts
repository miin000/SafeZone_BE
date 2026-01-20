import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
