import { IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Length(6, 6, { message: 'Mã OTP phải có 6 chữ số' })
  otp: string;
}
