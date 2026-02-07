import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { PushService } from './push.service';
import { Notification } from './entities/notification.entity';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { ZoneModule } from '../zone/zone.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    AuthModule,
    forwardRef(() => ZoneModule),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, EmailService, SmsService, PushService],
  exports: [NotificationService, EmailService, SmsService, PushService],
})
export class NotificationModule {}
