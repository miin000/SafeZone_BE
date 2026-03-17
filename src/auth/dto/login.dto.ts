import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

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

  // Source of login request: 'mobile' or 'web'
  // Used to enforce role-based access: regular users cannot login via web
  @IsOptional()
  @IsEnum(['mobile', 'web'], { message: 'Nguồn đăng nhập không hợp lệ' })
  source?: 'mobile' | 'web';
}
