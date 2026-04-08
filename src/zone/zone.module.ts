import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZoneController } from './zone.controller';
import { ZoneService } from './zone.service';
import { EpidemicZone } from './entities/epidemic-zone.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { GisModule } from '../gis/gis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EpidemicZone]),
    AuthModule,
    GisModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [ZoneController],
  providers: [ZoneService],
  exports: [ZoneService],
})
export class ZoneModule {}
