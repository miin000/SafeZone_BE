import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private isConfigured = false;
  private resend: Resend;
  private apiKey: string;
  private senderEmail: string;
  private senderName: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // Configure Resend email service
    // Sign up at https://resend.com (free tier: 3000 emails/month)

    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || '';
    this.senderEmail =
      this.configService.get<string>('RESEND_SENDER_EMAIL') ||
      'onboarding@resend.dev';
    this.senderName =
      this.configService.get<string>('RESEND_SENDER_NAME') || 'SafeZone';

    this.logger.log(
      `Resend API Key: ${this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT SET'}`,
    );
    this.logger.log(`Resend Sender Email: ${this.senderEmail}`);
    this.logger.log(`Resend Sender Name: ${this.senderName}`);

    if (this.apiKey) {
      this.resend = new Resend(this.apiKey);
      this.isConfigured = true;
      this.logger.log('✅ Resend email service configured');
    } else {
      this.logger.warn(
        '⚠️ Resend API key not configured. Emails will be logged to console only.',
      );
      this.logger.warn('   RESEND_API_KEY: NOT SET');
      this.logger.warn(
        'Sign up for free at https://resend.com (3000 emails/month free)',
      );
      this.logger.warn('Then set RESEND_API_KEY in .env file');
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    const { to, subject, text, html } = options;

    // If not configured, just log
    if (!this.isConfigured) {
      this.logger.log('='.repeat(50));
      this.logger.log('[EMAIL - DEV MODE - NOT SENDING]');
      this.logger.log(`To: ${to}`);
      this.logger.log(`Subject: ${subject}`);
      this.logger.log(`Content: ${text || html?.substring(0, 200)}`);
      this.logger.log('='.repeat(50));
      return true;
    }

    try {
      this.logger.log(`📧 Sending email via Resend...`);
      this.logger.log(`   To: ${to}`);
      this.logger.log(`   From: ${this.senderName} <${this.senderEmail}>`);
      this.logger.log(`   Subject: ${subject}`);

      const emailPayload: any = {
        from: `${this.senderName} <${this.senderEmail}>`,
        to: [to],
        subject: subject,
      };

      if (html) emailPayload.html = html;
      else if (text) emailPayload.text = text;

      const response = await this.resend.emails.send(emailPayload);

      if (response.error) {
        this.logger.error(
          `❌ Resend API error: ${JSON.stringify(response.error)}`,
        );
        return false;
      }

      this.logger.log(`✅ Email sent successfully!`);
      this.logger.log(`   Email ID: ${response.data?.id}`);

      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${to}`);
      this.logger.error(`   Error: ${error.message}`);
      return false;
    }
  }

  async sendOtpEmail(
    email: string,
    otp: string,
    name?: string,
  ): Promise<boolean> {
    const subject = 'SafeZone - Ma xac minh email cua ban';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin: 0; padding: 0; background: #f4f6f8; color: #222; font-family: Arial, sans-serif; }
          .container { max-width: 560px; margin: 0 auto; padding: 20px; }
          .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
          .header { background: #0f172a; color: #ffffff; padding: 16px 20px; font-size: 18px; font-weight: 600; }
          .content { padding: 20px; line-height: 1.6; font-size: 14px; }
          .otp-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; text-align: center; padding: 14px; margin: 16px 0; font-size: 30px; font-weight: 700; letter-spacing: 6px; color: #0f172a; }
          .hint { color: #475569; font-size: 13px; }
          .footer { color: #6b7280; font-size: 12px; padding: 16px 20px 20px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">SafeZone</div>
            <div class="content">
              <p>Xin chao${name ? ` <strong>${name}</strong>` : ''},</p>
              <p>Day la ma xac minh email cho tai khoan SafeZone cua ban:</p>
              <div class="otp-box">${otp}</div>
              <p>Ma co hieu luc trong <strong>10 phut</strong>.</p>
              <p class="hint">Neu ban khong thuc hien yeu cau nay, vui long bo qua email.</p>
            </div>
            <div class="footer">
              Email duoc gui tu dong boi he thong SafeZone. Vui long khong chia se ma cho nguoi khac.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
SafeZone - Ma xac minh email

Xin chao${name ? ` ${name}` : ''},

Ma xac minh cua ban la: ${otp}

Ma co hieu luc trong 10 phut.

Khong chia se ma nay voi bat ky ai.

---
Email duoc gui tu dong boi he thong SafeZone.
    `;

    return this.sendEmail({ to: email, subject, html, text });
  }

  async sendPasswordResetEmail(
    email: string,
    otp: string,
    name?: string,
  ): Promise<boolean> {
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
