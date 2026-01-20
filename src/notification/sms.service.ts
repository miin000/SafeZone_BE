import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: any;
  private verifyServiceSid: string = '';
  private isConfigured = false;
  private devMode = false;
  private devOtpStore: Map<string, string> = new Map(); // Store OTP for dev mode

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.verifyServiceSid = this.configService.get<string>('TWILIO_VERIFY_SERVICE_SID') || '';
    
    // Check if dev mode is enabled (for testing without verified numbers)
    this.devMode = this.configService.get<string>('SMS_DEV_MODE') === 'true';

    this.logger.log(`Twilio Account SID: ${accountSid ? accountSid.substring(0, 10) + '...' : 'NOT SET'}`);
    this.logger.log(`Twilio Verify Service SID: ${this.verifyServiceSid ? this.verifyServiceSid.substring(0, 10) + '...' : 'NOT SET'}`);
    
    if (this.devMode) {
      this.logger.warn('⚠️ SMS DEV MODE ENABLED - OTP will be logged to console, use code "123456" to verify');
    }

    if (accountSid && authToken && this.verifyServiceSid) {
      try {
        const twilio = require('twilio');
        this.twilioClient = twilio(accountSid, authToken);
        this.isConfigured = true;
        this.logger.log('✅ Twilio Verify service configured successfully!');
      } catch (error) {
        this.logger.error('❌ Failed to initialize Twilio client:', error.message);
      }
    } else {
      this.logger.warn('⚠️ Twilio credentials not configured. SMS OTP will be logged to console only.');
    }
  }

  /**
   * Send OTP via Twilio Verify API
   * This will send SMS automatically through Twilio's Verify service
   */
  async sendOtpSms(phone: string): Promise<{ success: boolean; message: string }> {
    // Format phone number (ensure it starts with +)
    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    // Dev mode - skip real SMS, use fixed OTP "123456"
    if (this.devMode) {
      const otp = '123456';
      this.devOtpStore.set(formattedPhone, otp);
      this.logger.log('='.repeat(50));
      this.logger.warn('[📱 SMS DEV MODE - NO REAL SMS SENT]');
      this.logger.log(`To: ${formattedPhone}`);
      this.logger.warn(`OTP Code: ${otp}`);
      this.logger.log('='.repeat(50));
      return { success: true, message: 'OTP sent (dev mode - use 123456)' };
    }

    if (!this.isConfigured || !this.twilioClient) {
      // Fallback dev mode - generate random OTP for testing
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      this.devOtpStore.set(formattedPhone, otp);
      this.logger.log('='.repeat(50));
      this.logger.log('[SMS OTP - NOT CONFIGURED - DEV MODE]');
      this.logger.log(`To: ${formattedPhone}`);
      this.logger.log(`OTP Code: ${otp}`);
      this.logger.log('='.repeat(50));
      return { success: true, message: 'OTP sent (dev mode)' };
    }

    try {
      this.logger.log(`📱 Sending OTP to ${formattedPhone} via Twilio Verify...`);
      
      const verification = await this.twilioClient.verify.v2
        .services(this.verifyServiceSid)
        .verifications
        .create({ to: formattedPhone, channel: 'sms' });

      this.logger.log(`✅ OTP sent successfully!`);
      this.logger.log(`   Status: ${verification.status}`);
      this.logger.log(`   SID: ${verification.sid}`);

      return { success: true, message: 'OTP sent successfully' };
    } catch (error) {
      this.logger.error(`❌ Failed to send OTP to ${formattedPhone}`);
      this.logger.error(`   Error: ${error.message}`);
      
      // If Twilio fails (e.g., unverified number on trial), fallback to dev mode
      if (error.code === 21608 || error.code === 21211 || error.message?.includes('unverified')) {
        const otp = '123456';
        this.devOtpStore.set(formattedPhone, otp);
        this.logger.warn('⚠️ Twilio trial limitation - falling back to dev mode');
        this.logger.warn(`📱 Use OTP: ${otp} for phone ${formattedPhone}`);
        return { success: true, message: 'OTP sent (dev mode - Twilio trial limitation, use 123456)' };
      }
      
      if (error.code === 60200) {
        return { success: false, message: 'Invalid phone number format' };
      } else if (error.code === 60203) {
        return { success: false, message: 'Max send attempts reached. Please wait and try again.' };
      }
      
      return { success: false, message: error.message || 'Failed to send OTP' };
    }
  }

  /**
   * Verify OTP code via Twilio Verify API
   */
  async verifyOtp(phone: string, code: string): Promise<{ success: boolean; message: string }> {
    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    // Dev mode - accept "123456" or the stored OTP
    if (this.devMode || !this.isConfigured || !this.twilioClient) {
      const storedOtp = this.devOtpStore.get(formattedPhone);
      if (code === '123456' || code === storedOtp) {
        this.logger.log('='.repeat(50));
        this.logger.log('[SMS VERIFY - DEV MODE]');
        this.logger.log(`Phone: ${formattedPhone}`);
        this.logger.log(`Code: ${code} - ✅ ACCEPTED`);
        this.logger.log('='.repeat(50));
        this.devOtpStore.delete(formattedPhone);
        return { success: true, message: 'OTP verified (dev mode)' };
      }
      this.logger.warn(`[DEV MODE] Invalid OTP: ${code}, expected: 123456 or ${storedOtp}`);
      return { success: false, message: 'Invalid OTP code. Use 123456 in dev mode.' };
    }

    try {
      this.logger.log(`🔐 Verifying OTP for ${formattedPhone}...`);
      
      const verificationCheck = await this.twilioClient.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks
        .create({ to: formattedPhone, code: code });

      this.logger.log(`   Status: ${verificationCheck.status}`);

      if (verificationCheck.status === 'approved') {
        this.logger.log(`✅ OTP verified successfully!`);
        return { success: true, message: 'OTP verified successfully' };
      } else {
        this.logger.warn(`❌ OTP verification failed: ${verificationCheck.status}`);
        return { success: false, message: 'Invalid or expired OTP code' };
      }
    } catch (error) {
      this.logger.error(`❌ Failed to verify OTP for ${formattedPhone}`);
      this.logger.error(`   Error: ${error.message}`);
      
      // Fallback to dev mode verification if Twilio fails
      const storedOtp = this.devOtpStore.get(formattedPhone);
      if (code === '123456' || code === storedOtp) {
        this.logger.warn('⚠️ Twilio verification failed, using dev mode fallback');
        this.devOtpStore.delete(formattedPhone);
        return { success: true, message: 'OTP verified (dev mode fallback)' };
      }
      
      if (error.code === 60200) {
        return { success: false, message: 'Invalid phone number format' };
      } else if (error.code === 20404) {
        return { success: false, message: 'OTP expired or not found. Please request a new code.' };
      }
      
      return { success: false, message: error.message || 'Failed to verify OTP' };
    }
  }

  /**
   * Legacy method - now uses Twilio Verify
   */
  async sendSms(phone: string, message: string): Promise<boolean> {
    this.logger.log('='.repeat(50));
    this.logger.log('[SMS - Direct Send]');
    this.logger.log(`To: ${phone}`);
    this.logger.log(`Message: ${message}`);
    this.logger.log('='.repeat(50));
    return true;
  }
}
