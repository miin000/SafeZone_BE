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
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { EmailService } from './email.service';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
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
  @UseGuards(AuthGuard('jwt'))
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
