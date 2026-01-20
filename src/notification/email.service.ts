import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private isConfigured = false;
  private senderEmail: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // Configure email transporter after ConfigModule is fully loaded
    // Using Mailjet SMTP (Free tier: 200 emails/day, 6000 emails/month)
    // Sign up at https://www.mailjet.com
    
    const apiKey = this.configService.get<string>('MAILJET_API_KEY');
    const secretKey = this.configService.get<string>('MAILJET_SECRET_KEY');
    this.senderEmail = this.configService.get<string>('MAILJET_SENDER_EMAIL') || 'no-reply@safezone.website';

    const port = parseInt(this.configService.get<string>('MAILJET_PORT') || '465');
    const emailConfig = {
      host: this.configService.get<string>('MAILJET_HOST') || 'in-v3.mailjet.com',
      port: port,
      secure: port === 465, // true for port 465 (SSL), false for port 587 (STARTTLS)
      auth: {
        user: apiKey,
        pass: secretKey,
      },
    };

    this.logger.log(`Mailjet Config - Host: ${emailConfig.host}, Port: ${emailConfig.port}, Secure: ${emailConfig.secure}`);
    this.logger.log(`Mailjet API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
    this.logger.log(`Mailjet Secret Key: ${secretKey ? secretKey.substring(0, 8) + '...' : 'NOT SET'}`);
    this.logger.log(`Mailjet Sender Email: ${this.senderEmail}`);

    // Only create transporter if Mailjet credentials are provided
    if (apiKey && secretKey) {
      this.transporter = nodemailer.createTransport(emailConfig);
      this.isConfigured = true;
      this.logger.log('Mailjet email transporter configured');
      
      // Verify connection on startup
      await this.verifyConnection();
    } else {
      this.logger.warn('⚠️ Mailjet credentials not configured. Emails will be logged to console only.');
      this.logger.warn('   MAILJET_API_KEY: ' + (apiKey ? 'SET' : 'NOT SET'));
      this.logger.warn('   MAILJET_SECRET_KEY: ' + (secretKey ? 'SET' : 'NOT SET'));
      this.logger.warn('Sign up for free at https://www.mailjet.com (200 emails/day free)');
    }
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      this.logger.log('✅ Mailjet SMTP connection verified successfully!');
    } catch (error) {
      this.logger.error('❌ Mailjet SMTP connection verification failed!');
      this.logger.error(`Error: ${error.message}`);
      this.logger.error('Please check:');
      this.logger.error('  1. MAILJET_API_KEY and MAILJET_SECRET_KEY are correct');
      this.logger.error('  2. MAILJET_SENDER_EMAIL is verified in Mailjet dashboard');
      this.logger.error('  3. Network can connect to in-v3.mailjet.com:587');
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    const { to, subject, text, html } = options;

    // If transporter is not configured, just log
    if (!this.transporter || !this.isConfigured) {
      this.logger.log('='.repeat(50));
      this.logger.log('[EMAIL - DEV MODE - NOT SENDING]');
      this.logger.log(`To: ${to}`);
      this.logger.log(`Subject: ${subject}`);
      this.logger.log(`Content: ${text || html?.substring(0, 200)}`);
      this.logger.log('='.repeat(50));
      return true; // Return true in dev mode
    }

    try {
      const mailOptions = {
        from: `"SafeZone" <${this.senderEmail}>`,
        to,
        subject,
        text,
        html,
      };

      this.logger.log(`📧 Sending email...`);
      this.logger.log(`   To: ${to}`);
      this.logger.log(`   From: ${mailOptions.from}`);
      this.logger.log(`   Subject: ${subject}`);

      const info = await this.transporter.sendMail(mailOptions);
      
      this.logger.log(`✅ Email sent successfully!`);
      this.logger.log(`   Message ID: ${info.messageId}`);
      this.logger.log(`   Response: ${info.response}`);
      this.logger.log(`   Accepted: ${info.accepted?.join(', ')}`);
      this.logger.log(`   Rejected: ${info.rejected?.join(', ') || 'none'}`);
      
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${to}`);
      this.logger.error(`   Error Code: ${error.code}`);
      this.logger.error(`   Error Message: ${error.message}`);
      
      if (error.responseCode) {
        this.logger.error(`   SMTP Response Code: ${error.responseCode}`);
      }
      if (error.response) {
        this.logger.error(`   SMTP Response: ${error.response}`);
      }
      
      // Common errors
      if (error.code === 'EAUTH') {
        this.logger.error('   ⚠️  Authentication failed. Check MAILJET_API_KEY and MAILJET_SECRET_KEY');
      } else if (error.code === 'ECONNECTION') {
        this.logger.error('   ⚠️  Connection failed. Check network/firewall settings');
      } else if (error.responseCode === 550) {
        this.logger.error('   ⚠️  Sender email not verified. Verify email in Mailjet dashboard');
      }
      
      return false;
    }
  }

  async sendOtpEmail(email: string, otp: string, name?: string): Promise<boolean> {
    const subject = 'Mã xác thực OTP - SafeZone';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .otp-box { background: #2563eb; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; margin: 20px 0; letter-spacing: 8px; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin-top: 20px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛡️ SafeZone</h1>
          </div>
          <div class="content">
            <p>Xin chào${name ? ` <strong>${name}</strong>` : ''},</p>
            <p>Bạn đã yêu cầu xác thực email cho tài khoản SafeZone. Đây là mã OTP của bạn:</p>
            
            <div class="otp-box">${otp}</div>
            
            <p>Mã này sẽ hết hạn sau <strong>10 phút</strong>.</p>
            
            <div class="warning">
              ⚠️ <strong>Lưu ý:</strong> Không chia sẻ mã này với bất kỳ ai. Nhân viên SafeZone sẽ không bao giờ yêu cầu mã OTP của bạn.
            </div>
          </div>
          <div class="footer">
            <p>Email này được gửi tự động từ hệ thống SafeZone.</p>
            <p>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
SafeZone - Mã xác thực OTP

Xin chào${name ? ` ${name}` : ''},

Mã OTP của bạn là: ${otp}

Mã này sẽ hết hạn sau 10 phút.

Không chia sẻ mã này với bất kỳ ai.

---
Email này được gửi tự động từ hệ thống SafeZone.
    `;

    return this.sendEmail({ to: email, subject, html, text });
  }

  async sendPasswordResetEmail(email: string, otp: string, name?: string): Promise<boolean> {
    const subject = 'Đặt lại mật khẩu - SafeZone';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .otp-box { background: #dc2626; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; margin: 20px 0; letter-spacing: 8px; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin-top: 20px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Đặt lại mật khẩu</h1>
          </div>
          <div class="content">
            <p>Xin chào${name ? ` <strong>${name}</strong>` : ''},</p>
            <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản SafeZone. Đây là mã OTP của bạn:</p>
            
            <div class="otp-box">${otp}</div>
            
            <p>Mã này sẽ hết hạn sau <strong>10 phút</strong>.</p>
            
            <div class="warning">
              ⚠️ <strong>Lưu ý:</strong> Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này và đảm bảo rằng tài khoản của bạn vẫn an toàn.
            </div>
          </div>
          <div class="footer">
            <p>Email này được gửi tự động từ hệ thống SafeZone.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
SafeZone - Đặt lại mật khẩu

Xin chào${name ? ` ${name}` : ''},

Mã OTP để đặt lại mật khẩu của bạn là: ${otp}

Mã này sẽ hết hạn sau 10 phút.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.

---
Email này được gửi tự động từ hệ thống SafeZone.
    `;

    return this.sendEmail({ to: email, subject, html, text });
  }
}
