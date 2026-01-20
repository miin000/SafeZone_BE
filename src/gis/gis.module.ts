import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GisController } from './gis.controller';
import { GisService } from './gis.service';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [GisController],
  providers: [GisService],
  exports: [GisService],
})
export class GisModule {}
