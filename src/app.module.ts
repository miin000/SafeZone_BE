import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GisModule } from './gis/gis.module';
import { AuthModule } from './auth/auth.module';
import { ReportModule } from './report/report.module';
import { ZoneModule } from './zone/zone.module';
import { NotificationModule } from './notification/notification.module';
import { PostModule } from './post/post.module';
import { HealthInfoModule } from './health-info/health-info.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'safezone',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    GisModule,
    AuthModule,
    ReportModule,
    ZoneModule,
    NotificationModule,
    PostModule,
    HealthInfoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
