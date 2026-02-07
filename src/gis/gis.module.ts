import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GisController } from './gis.controller';
import { GisService } from './gis.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [TypeOrmModule.forFeature([]), AdminModule],
  controllers: [GisController],
  providers: [GisService],
  exports: [GisService],
})
export class GisModule {}
