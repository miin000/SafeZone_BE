import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @IsOptional()
  phone?: string;

  @IsString({ message: 'Email không hợp lệ' })
  @IsOptional()
  email?: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  password: string;
}
