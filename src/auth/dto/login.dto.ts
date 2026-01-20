import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @IsNotEmpty({ message: 'Số điện thoại là bắt buộc' })
  phone: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  password: string;
}
