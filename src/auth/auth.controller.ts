import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.id, updateProfileDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('fcm-token')
  async updateFcmToken(
    @Request() req,
    @Body() updateFcmTokenDto: UpdateFcmTokenDto,
  ) {
    await this.authService.updateFcmToken(req.user.id, updateFcmTokenDto.token);
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('verify')
  async verifyToken(@Request() req) {
    return { valid: true, user: req.user };
  }

  // ==================== OTP & Verification ====================

  // Get verification status
  @UseGuards(AuthGuard('jwt'))
  @Get('verification-status')
  async getVerificationStatus(@Request() req) {
    return this.authService.getVerificationStatus(req.user.id);
  }

  // Send Email OTP
  @UseGuards(AuthGuard('jwt'))
  @Post('send-email-otp')
  async sendEmailOtp(@Request() req) {
    return this.authService.sendEmailOtp(req.user.id);
  }

  // Verify Email OTP
  @UseGuards(AuthGuard('jwt'))
  @Post('verify-email')
  async verifyEmail(@Request() req, @Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyEmailOtp(req.user.id, verifyOtpDto.otp);
  }

  // Send Phone OTP
  @UseGuards(AuthGuard('jwt'))
  @Post('send-phone-otp')
  async sendPhoneOtp(@Request() req) {
    return this.authService.sendPhoneOtp(req.user.id);
  }

  // Verify Phone OTP
  @UseGuards(AuthGuard('jwt'))
  @Post('verify-phone')
  async verifyPhone(@Request() req, @Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyPhoneOtp(req.user.id, verifyOtpDto.otp);
  }

  // ==================== Password Management ====================

  // Change Password (logged in user)
  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(@Request() req, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  // Forgot Password - Send OTP (public)
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  // Reset Password with OTP (public)
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.email,
      resetPasswordDto.otp,
      resetPasswordDto.newPassword,
    );
  }
}
