import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DiseaseOutbreakService } from './disease-outbreak.service';
import {
  CloseOutbreakDto,
  CreateOutbreakDto,
  NewOutbreakFromOldDto,
  UpdateOutbreakDto,
} from './dto/disease-outbreak.dto';

@Controller()
export class DiseaseOutbreakController {
  constructor(private readonly outbreakService: DiseaseOutbreakService) {}

  // Admin: list outbreaks for a disease
  @UseGuards(AuthGuard('jwt'))
  @Get('diseases/:diseaseId/outbreaks')
  list(@Param('diseaseId') diseaseId: string) {
    return this.outbreakService.listByDisease(diseaseId);
  }

  // Admin: create a new outbreak for a disease
  @UseGuards(AuthGuard('jwt'))
  @Post('diseases/:diseaseId/outbreaks')
  create(
    @Param('diseaseId') diseaseId: string,
    @Body() dto: CreateOutbreakDto,
  ) {
    return this.outbreakService.createForDisease(diseaseId, dto);
  }

  // Admin: close outbreak (and archive its cases)
  @UseGuards(AuthGuard('jwt'))
  @Patch('outbreaks/:outbreakId/close')
  close(@Param('outbreakId') outbreakId: string, @Body() dto: CloseOutbreakDto) {
    return this.outbreakService.close(outbreakId, dto);
  }

  // Admin: reopen outbreak (and unarchive its cases)
  @UseGuards(AuthGuard('jwt'))
  @Post('outbreaks/:outbreakId/reopen')
  reopen(@Param('outbreakId') outbreakId: string) {
    return this.outbreakService.reopen(outbreakId);
  }

  // Admin: close old + create new outbreak from it
  @UseGuards(AuthGuard('jwt'))
  @Post('outbreaks/:outbreakId/new-from-old')
  newFromOld(
    @Param('outbreakId') outbreakId: string,
    @Body() dto: NewOutbreakFromOldDto,
  ) {
    return this.outbreakService.newFromOld(outbreakId, dto);
  }

  // Admin: update outbreak fields (name/description/dates)
  @UseGuards(AuthGuard('jwt'))
  @Patch('outbreaks/:outbreakId')
  update(
    @Param('outbreakId') outbreakId: string,
    @Body() dto: UpdateOutbreakDto,
  ) {
    return this.outbreakService.update(outbreakId, dto);
  }

  // Admin: delete outbreak (and restore/unarchive its cases)
  @UseGuards(AuthGuard('jwt'))
  @Delete('outbreaks/:outbreakId')
  remove(@Param('outbreakId') outbreakId: string) {
    return this.outbreakService.remove(outbreakId);
  }
}
