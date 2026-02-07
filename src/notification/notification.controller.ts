import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { EmailService } from './email.service';
import { NotificationType } from './entities/notification.entity';
import { ZoneService } from '../zone/zone.service';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly zoneService: ZoneService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  async findAll(@Request() req) {
    return this.notificationService.findByUser(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const count = await this.notificationService.getUnreadCount(req.user.id);
    return { count };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationService.markAsRead(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('read-all')
  async markAllAsRead(@Request() req) {
    await this.notificationService.markAllAsRead(req.user.id);
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    await this.notificationService.delete(id, req.user.id);
    return { success: true };
  }

  // Admin endpoints
  @Get('history')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async getBroadcastHistory() {
    return this.notificationService.findBroadcastHistory();
  }

  @Post('send')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async send(@Body() body: { title: string; body: string; type: string; zoneId?: string }) {
    // Send notification based on type (all users or specific zone)
    if (body.type === 'zone' && body.zoneId) {
      // Get zone info
      const zone = await this.zoneService.findOne(body.zoneId);
      
      // Send as broadcast with zone info in data
      return this.notificationService.createBroadcast(
        body.title,
        body.body,
        NotificationType.EPIDEMIC_ALERT,
        { 
          zoneId: body.zoneId,
          zoneName: zone.name,
        },
      );
    } else {
      // Broadcast to all users
      return this.notificationService.createBroadcast(
        body.title,
        body.body,
        NotificationType.SYSTEM,
      );
    }
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  @Post('broadcast')
  async createBroadcast(@Body() createNotificationDto: CreateNotificationDto) {
    // TODO: Add admin guard
    return this.notificationService.createBroadcast(
      createNotificationDto.title,
      createNotificationDto.body,
      createNotificationDto.type,
      createNotificationDto.data,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send/:userId')
  async sendToUser(
    @Param('userId') userId: string,
    @Body() createNotificationDto: CreateNotificationDto,
  ) {
    // TODO: Add admin guard
    return this.notificationService.sendToUser(
      userId,
      createNotificationDto.title,
      createNotificationDto.body,
      createNotificationDto.type,
      createNotificationDto.data,
    );
  }

  // Test email endpoint (for debugging)
  @Get('test-email')
  async testEmail(@Query('email') email: string) {
    if (!email) {
      return { success: false, message: 'Email parameter required. Use ?email=your@email.com' };
    }
    
    const result = await this.emailService.sendOtpEmail(email, '123456', 'Test User');
    return { 
      success: result, 
      message: result ? 'Email sent successfully! Check your inbox.' : 'Failed to send email. Check server logs.'
    };
  }
}
