import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '../entities/user.entity';

/**
 * Guard that only requires phone verification.
 * Used for features like creating reports where only phone verification is needed.
 */
@Injectable()
export class PhoneVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      throw new ForbiddenException('Người dùng không tồn tại');
    }

    // Only check phone verification for reporting
    if (!user.isPhoneVerified) {
      throw new ForbiddenException(
        'Vui lòng xác thực số điện thoại trước khi gửi báo cáo',
      );
    }

    return true;
  }
}
