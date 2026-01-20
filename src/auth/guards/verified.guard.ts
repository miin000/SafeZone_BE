import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '../entities/user.entity';

@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      throw new ForbiddenException('Người dùng không tồn tại');
    }

    // Check if both email and phone are verified
    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Vui lòng xác thực email trước khi thực hiện chức năng này',
      );
    }

    if (!user.isPhoneVerified) {
      throw new ForbiddenException(
        'Vui lòng xác thực số điện thoại trước khi thực hiện chức năng này',
      );
    }

    return true;
  }
}
