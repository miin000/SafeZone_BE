import { IsEmail, IsString, MinLength, IsOptional, IsNotEmpty, ValidateIf } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @ValidateIf((o) => o.email !== '' && o.email !== null && o.email !== undefined)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @IsString()
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  name: string;

  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @IsNotEmpty({ message: 'Số điện thoại là bắt buộc' })
  phone: string;
}
