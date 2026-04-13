import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disease } from './entities/disease.entity';
import { DiseaseOutbreak } from './entities/disease-outbreak.entity';
import { DiseaseService } from './disease.service';
import { DiseaseController } from './disease.controller';
import { DiseaseOutbreakService } from './disease-outbreak.service';
import { DiseaseOutbreakController } from './disease-outbreak.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Disease, DiseaseOutbreak])],
  controllers: [DiseaseController, DiseaseOutbreakController],
  providers: [DiseaseService, DiseaseOutbreakService],
  exports: [DiseaseService, DiseaseOutbreakService],
})
export class DiseaseModule {}
