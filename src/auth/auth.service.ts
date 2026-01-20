import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailService } from '../notification/email.service';
import { SmsService } from '../notification/sms.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{ user: User; token: string }> {
    const { email, password, name, phone } = registerDto;

    // Normalize phone number
    const normalizedPhone = this.normalizePhoneNumber(phone);

    // Check if phone already exists
    const existingPhoneUser = await this.userRepository.findOne({ where: { phone: normalizedPhone } });
    if (existingPhoneUser) {
      throw new ConflictException('Số điện thoại đã được sử dụng');
    }

    // Check if email already exists (if provided)
    const trimmedEmail = email?.trim() || undefined;
    if (trimmedEmail) {
      const existingEmailUser = await this.userRepository.findOne({ where: { email: trimmedEmail } });
      if (existingEmailUser) {
        throw new ConflictException('Email đã được sử dụng');
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = this.userRepository.create({
      email: trimmedEmail,
      password: hashedPassword,
      name,
      phone: normalizedPhone,
    });

    await this.userRepository.save(user);

    // Generate token
    const token = this.generateToken(user);

    // Remove password from response
    delete user.password;

    return { user, token };
  }

  async login(loginDto: LoginDto): Promise<{ user: User; token: string }> {
    const { phone, password } = loginDto;

    // Normalize phone number
    const normalizedPhone = this.normalizePhoneNumber(phone);
    
    // Find user by phone
    let user = await this.userRepository.findOne({ where: { phone: normalizedPhone } });
    
    // Also try original phone if not found
    if (!user) {
      user = await this.userRepository.findOne({ where: { phone } });
    }

    if (!user) {
      throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password!);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    // Generate token
    const token = this.generateToken(user);

    // Remove password from response
    delete user.password;

    return { user, token };
  }

  async validateUser(userId: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;
    delete user.password;
    return user;
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }
    delete user.password;
    return user;
  }

  async updateProfile(userId: string, updateData: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    // Don't allow password update through this method
    delete updateData.password;
    delete updateData.email;
    delete updateData.id;

    // If phone is being updated, check if it's already used by another user
    if (updateData.phone && updateData.phone !== user.phone) {
      const normalizedPhone = this.normalizePhoneNumber(updateData.phone);
      updateData.phone = normalizedPhone;

      const existingUser = await this.userRepository.findOne({ 
        where: { phone: normalizedPhone } 
      });
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Số điện thoại đã được sử dụng bởi tài khoản khác');
      }

      // Reset phone verification when phone changes
      updateData.isPhoneVerified = false;
    }

    Object.assign(user, updateData);
    await this.userRepository.save(user);

    delete user.password;
    return user;
  }

  async updateFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.userRepository.update(userId, { fcmToken });
  }

  // Generate 6-digit OTP
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Get verification status
  // Note: Only phone verification is required for reporting
  async getVerificationStatus(userId: string): Promise<{
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    isFullyVerified: boolean;
    canReport: boolean;
    email: string | null;
    phone: string;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    return {
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isFullyVerified: user.isEmailVerified && user.isPhoneVerified,
      canReport: user.isPhoneVerified, // Only phone verification required for reporting
      email: user.email || null,
      phone: user.phone,
    };
  }

  // Send Email OTP
  async sendEmailOtp(userId: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    if (!user.email) {
      throw new BadRequestException('Chưa cập nhật email');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email đã được xác thực');
    }

    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.emailOtp = otp;
    user.emailOtpExpires = otpExpires;
    await this.userRepository.save(user);

    // Send email via email service
    const emailSent = await this.emailService.sendOtpEmail(user.email, otp, user.name);
    
    if (!emailSent) {
      throw new BadRequestException('Không thể gửi email. Vui lòng thử lại sau.');
    }

    return { message: 'Mã OTP đã được gửi đến email của bạn' };
  }

  // Verify Email OTP
  async verifyEmailOtp(userId: string, otp: string): Promise<{ message: string; verified: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email đã được xác thực');
    }

    if (!user.emailOtp || !user.emailOtpExpires) {
      throw new BadRequestException('Chưa yêu cầu mã OTP');
    }

    if (new Date() > user.emailOtpExpires) {
      throw new BadRequestException('Mã OTP đã hết hạn');
    }

    if (user.emailOtp !== otp) {
      throw new BadRequestException('Mã OTP không đúng');
    }

    user.isEmailVerified = true;
    user.emailOtp = null;
    user.emailOtpExpires = null;
    await this.userRepository.save(user);

    return { message: 'Xác thực email thành công', verified: true };
  }

  // Send Phone OTP via Twilio Verify
  async sendPhoneOtp(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    if (!user.phone) {
      throw new BadRequestException('Chưa cập nhật số điện thoại');
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException('Số điện thoại đã được xác thực');
    }

    // Use Twilio Verify API - it handles OTP generation and sending
    const result = await this.smsService.sendOtpSms(user.phone);
    
    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    return { success: true, message: 'Mã OTP đã được gửi đến số điện thoại của bạn' };
  }

  // Verify Phone OTP via Twilio Verify
  async verifyPhoneOtp(userId: string, otp: string): Promise<{ message: string; verified: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    if (!user.phone) {
      throw new BadRequestException('Chưa cập nhật số điện thoại');
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException('Số điện thoại đã được xác thực');
    }

    // Verify OTP via Twilio Verify API
    const result = await this.smsService.verifyOtp(user.phone, otp);
    
    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    // Mark phone as verified
    user.isPhoneVerified = true;
    user.phoneOtp = null;
    user.phoneOtpExpires = null;
    await this.userRepository.save(user);

    return { message: 'Xác thực số điện thoại thành công', verified: true };
  }

  // Change Password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password!);
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    const salt = await bcrypt.genSalt();
    user.password = await bcrypt.hash(newPassword, salt);
    await this.userRepository.save(user);

    return { message: 'Đổi mật khẩu thành công' };
  }

  // Forgot Password - Send OTP
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      // Don't reveal if email exists
      return { message: 'Nếu email tồn tại, mã OTP sẽ được gửi' };
    }

    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.emailOtp = otp;
    user.emailOtpExpires = otpExpires;
    await this.userRepository.save(user);

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(user.email!, otp, user.name);

    return { message: 'Nếu email tồn tại, mã OTP sẽ được gửi' };
  }

  // Reset Password with OTP
  async resetPassword(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('Thông tin không hợp lệ');
    }

    if (!user.emailOtp || !user.emailOtpExpires) {
      throw new BadRequestException('Chưa yêu cầu đặt lại mật khẩu');
    }

    if (new Date() > user.emailOtpExpires) {
      throw new BadRequestException('Mã OTP đã hết hạn');
    }

    if (user.emailOtp !== otp) {
      throw new BadRequestException('Mã OTP không đúng');
    }

    const salt = await bcrypt.genSalt();
    user.password = await bcrypt.hash(newPassword, salt);
    user.emailOtp = null;
    user.emailOtpExpires = null;
    await this.userRepository.save(user);

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  // Normalize phone number to standard format (+84...)
  private normalizePhoneNumber(phone: string): string {
    // Remove all spaces and dashes
    let normalized = phone.replace(/[\s-]/g, '');
    
    // If starts with 0, replace with +84 (Vietnam)
    if (normalized.startsWith('0')) {
      normalized = '+84' + normalized.substring(1);
    }
    
    // If doesn't start with +, add +
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    
    return normalized;
  }

  private generateToken(user: User): string {
    const payload = { sub: user.id, phone: user.phone };
    return this.jwtService.sign(payload);
  }
}
