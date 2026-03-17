import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PushService } from './push.service';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private pushService: PushService,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create(
      createNotificationDto,
    );
    return this.notificationRepository.save(notification);
  }

  async createBroadcast(
    title: string,
    body: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      title,
      body,
      type,
      data,
      isBroadcast: true,
    });

    // Send push notification to all users via topic
    await this.pushService.sendToTopic('all', {
      title,
      body,
      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
    });

    return this.notificationRepository.save(notification);
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      title,
      body,
      type,
      data,
      userId,
      isBroadcast: false,
    });

    // Send push notification to specific user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.fcmToken) {
      await this.pushService.sendToDevice(user.fcmToken, {
        title,
        body,
        data: data
          ? Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)]),
            )
          : undefined,
      });
    }

    return this.notificationRepository.save(notification);
  }

  async findByUser(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: [{ userId }, { isBroadcast: true }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findOne(id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Thông báo không tồn tại');
    }
    return notification;
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.findOne(id);

    // Check if user owns this notification or it's a broadcast
    if (notification.userId && notification.userId !== userId) {
      throw new NotFoundException('Thông báo không tồn tại');
    }

    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: [
        { userId, isRead: false },
        { isBroadcast: true, isRead: false },
      ],
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    const notification = await this.findOne(id);
    if (notification.userId && notification.userId !== userId) {
      throw new NotFoundException('Thông báo không tồn tại');
    }
    await this.notificationRepository.remove(notification);
  }

  // Get broadcast notification history for admin
  async findBroadcastHistory(): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: [{ isBroadcast: true }, { userId: IsNull() }],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // Alert for epidemic zone
  async sendEpidemicAlert(
    zoneName: string,
    diseaseType: string,
    riskLevel: string,
    zoneId?: string,
  ): Promise<void> {
    const title = `⚠️ Cảnh báo dịch bệnh: ${diseaseType}`;
    const body = `Phát hiện vùng dịch mới tại ${zoneName}. Mức độ: ${riskLevel}`;

    // Save to database
    await this.createBroadcast(title, body, NotificationType.EPIDEMIC_ALERT, {
      zoneName,
      diseaseType,
      riskLevel,
      zoneId,
    });

    // Also broadcast push notification
    if (zoneId) {
      await this.pushService.sendEpidemicBroadcast(
        zoneName,
        diseaseType,
        riskLevel,
        zoneId,
      );
    }
  }

  // Send zone entry alert when user enters danger zone
  async sendZoneEntryAlert(
    userId: string,
    zoneName: string,
    diseaseType: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    zoneId: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user?.fcmToken) {
      this.logger.warn(
        `User ${userId} has no FCM token, cannot send zone entry alert`,
      );
      return;
    }

    // Send push notification
    await this.pushService.sendZoneEntryAlert(
      user.fcmToken,
      zoneName,
      diseaseType,
      riskLevel,
      zoneId,
    );

    // Save to database
    const riskText = {
      low: 'Thấp',
      medium: 'Trung bình',
      high: 'Cao',
      critical: 'Rất cao',
    };

    await this.sendToUser(
      userId,
      '⚠️ Cảnh báo: Bạn đang trong vùng dịch!',
      `Khu vực: ${zoneName}\nLoại bệnh: ${diseaseType}\nMức độ: ${riskText[riskLevel]}`,
      NotificationType.EPIDEMIC_ALERT,
      { zoneName, diseaseType, riskLevel, zoneId },
    );
  }

  // Send new post notification
  async sendNewPostNotification(
    postId: string,
    postTitle: string,
    authorName: string,
    authorId: string,
  ): Promise<void> {
    // Get all users except author
    const users = await this.userRepository.find({
      where: { fcmToken: Not(IsNull()) },
    });

    const tokens = users
      .filter((u) => u.id !== authorId && u.fcmToken)
      .map((u) => u.fcmToken);

    if (tokens.length > 0) {
      await this.pushService.sendNewPostNotification(
        tokens,
        postTitle,
        authorName,
        postId,
      );
    }

    // Save broadcast notification
    await this.createBroadcast(
      '📝 Bài viết mới',
      `${authorName} đã đăng: ${postTitle}`,
      NotificationType.NEW_POST,
      { postId, authorId, authorName },
    );
  }

  // Notification for report status update
  async sendReportUpdate(
    userId: string,
    reportId: string,
    status: string,
  ): Promise<void> {
    const title = 'Cập nhật báo cáo';
    const body = `Báo cáo của bạn đã được ${status === 'verified' ? 'xác nhận' : 'từ chối'}`;

    await this.sendToUser(userId, title, body, NotificationType.REPORT_UPDATE, {
      reportId,
      status,
    });
  }
}
