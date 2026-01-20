import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthInfoService } from './health-info.service';
import { HealthInfoController } from './health-info.controller';
import { HealthInfo } from './entities/health-info.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HealthInfo])],
  controllers: [HealthInfoController],
  providers: [HealthInfoService],
  exports: [HealthInfoService],
})
export class HealthInfoModule {}
