import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private isInitialized = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeFirebase();
  }

  private async initializeFirebase() {
    try {
      // Check if already initialized
      if (admin.apps.length > 0) {
        this.isInitialized = true;
        this.logger.log('✅ Firebase Admin already initialized');
        return;
      }

      // Try to load service account from file
      const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf8');
        const serviceAccount = JSON.parse(serviceAccountContent);
        
        // Ensure private key is properly formatted
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });

        this.isInitialized = true;
        this.logger.log(`✅ Firebase Admin initialized with project: ${serviceAccount.project_id}`);
      } else {
        // Try to load from environment variables
        const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
        const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
        const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

        if (projectId && clientEmail && privateKey) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          });

          this.isInitialized = true;
          this.logger.log(`✅ Firebase Admin initialized from env: ${projectId}`);
        } else {
          this.logger.warn('⚠️ Firebase not configured. Push notifications disabled.');
        }
      }
    } catch (error) {
      this.logger.error(`❌ Failed to initialize Firebase: ${error.message}`);
    }
  }

  /**
   * Send push notification to a single device
   */
  async sendToDevice(
    token: string,
    payload: PushNotificationPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isInitialized) {
      this.logger.warn('[PUSH] Firebase not initialized, logging notification:');
      this.logger.log(`  To: ${token.substring(0, 20)}...`);
      this.logger.log(`  Title: ${payload.title}`);
      this.logger.log(`  Body: ${payload.body}`);
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'safezone_alerts',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true,
            },
          },
        },
        webpush: {
          notification: {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
          },
          fcmOptions: {
            link: payload.data?.link || '/',
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`✅ Push sent successfully: ${response}`);
      return { success: true, messageId: response };
    } catch (error) {
      this.logger.error(`❌ Failed to send push: ${error.message}`);
      
      // Handle invalid token
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        return { success: false, error: 'invalid_token' };
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to multiple devices
   */
  async sendToDevices(
    tokens: string[],
    payload: PushNotificationPayload,
  ): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
    if (!this.isInitialized || tokens.length === 0) {
      return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
    }

    const invalidTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Firebase batch limit is 500
    const batches = this.chunkArray(tokens, 500);

    for (const batch of batches) {
      try {
        const message: admin.messaging.MulticastMessage = {
          tokens: batch,
          notification: {
            title: payload.title,
            body: payload.body,
            imageUrl: payload.imageUrl,
          },
          data: payload.data,
          android: {
            priority: 'high',
            notification: {
              channelId: 'safezone_alerts',
              priority: 'high',
              defaultSound: true,
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        
        successCount += response.successCount;
        failureCount += response.failureCount;

        // Collect invalid tokens
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            if (resp.error.code === 'messaging/invalid-registration-token' ||
                resp.error.code === 'messaging/registration-token-not-registered') {
              invalidTokens.push(batch[idx]);
            }
          }
        });
      } catch (error) {
        this.logger.error(`❌ Batch send failed: ${error.message}`);
        failureCount += batch.length;
      }
    }

    this.logger.log(`📊 Push batch result: ${successCount} success, ${failureCount} failed`);
    return { successCount, failureCount, invalidTokens };
  }

  /**
   * Send push notification to a topic (e.g., 'all', 'zone_123')
   */
  async sendToTopic(
    topic: string,
    payload: PushNotificationPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isInitialized) {
      this.logger.warn(`[PUSH] Topic notification (not sent): ${topic}`);
      this.logger.log(`  Title: ${payload.title}`);
      this.logger.log(`  Body: ${payload.body}`);
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'safezone_alerts',
            priority: 'high',
            defaultSound: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`✅ Topic push sent: ${topic} -> ${response}`);
      return { success: true, messageId: response };
    } catch (error) {
      this.logger.error(`❌ Failed to send to topic ${topic}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe devices to a topic
   */
  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    if (!this.isInitialized || tokens.length === 0) return;

    try {
      await admin.messaging().subscribeToTopic(tokens, topic);
      this.logger.log(`✅ Subscribed ${tokens.length} devices to topic: ${topic}`);
    } catch (error) {
      this.logger.error(`❌ Failed to subscribe to topic: ${error.message}`);
    }
  }

  /**
   * Unsubscribe devices from a topic
   */
  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    if (!this.isInitialized || tokens.length === 0) return;

    try {
      await admin.messaging().unsubscribeFromTopic(tokens, topic);
      this.logger.log(`✅ Unsubscribed ${tokens.length} devices from topic: ${topic}`);
    } catch (error) {
      this.logger.error(`❌ Failed to unsubscribe from topic: ${error.message}`);
    }
  }

  /**
   * Send zone entry alert - HIGH PRIORITY
   */
  async sendZoneEntryAlert(
    token: string,
    zoneName: string,
    diseaseType: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    zoneId: string,
  ): Promise<{ success: boolean }> {
    const riskEmoji = {
      low: '🟡',
      medium: '🟠',
      high: '🔴',
      critical: '⛔',
    };

    const riskText = {
      low: 'Thấp',
      medium: 'Trung bình',
      high: 'Cao',
      critical: 'Rất cao',
    };

    const payload: PushNotificationPayload = {
      title: `${riskEmoji[riskLevel]} CẢNH BÁO: Bạn đang trong vùng dịch!`,
      body: `Khu vực: ${zoneName}\nLoại bệnh: ${diseaseType}\nMức độ nguy hiểm: ${riskText[riskLevel]}`,
      data: {
        type: 'zone_entry',
        zoneId,
        zoneName,
        diseaseType,
        riskLevel,
        action: 'open_zone_detail',
      },
    };

    const result = await this.sendToDevice(token, payload);
    return { success: result.success };
  }

  /**
   * Send new post notification
   */
  async sendNewPostNotification(
    tokens: string[],
    postTitle: string,
    authorName: string,
    postId: string,
  ): Promise<void> {
    const payload: PushNotificationPayload = {
      title: '📝 Bài viết mới',
      body: `${authorName} đã đăng: ${postTitle}`,
      data: {
        type: 'new_post',
        postId,
        action: 'open_post',
      },
    };

    await this.sendToDevices(tokens, payload);
  }

  /**
   * Send system announcement
   */
  async sendSystemAnnouncement(
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const payload: PushNotificationPayload = {
      title: `📢 ${title}`,
      body,
      data: {
        type: 'system',
        ...data,
      },
    };

    await this.sendToTopic('all', payload);
  }

  /**
   * Send epidemic alert to all users
   */
  async sendEpidemicBroadcast(
    zoneName: string,
    diseaseType: string,
    riskLevel: string,
    zoneId: string,
  ): Promise<void> {
    const payload: PushNotificationPayload = {
      title: `⚠️ Cảnh báo dịch bệnh: ${diseaseType}`,
      body: `Phát hiện ổ dịch mới tại ${zoneName}. Mức độ: ${riskLevel}. Hãy cẩn thận khi di chuyển qua khu vực này.`,
      data: {
        type: 'epidemic_alert',
        zoneId,
        zoneName,
        diseaseType,
        riskLevel,
        action: 'open_map',
      },
    };

    await this.sendToTopic('all', payload);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
