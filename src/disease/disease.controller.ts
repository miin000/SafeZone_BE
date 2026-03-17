import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DiseaseService } from './disease.service';
import { CreateDiseaseDto, UpdateDiseaseDto } from './dto/disease.dto';

@Controller('diseases')
export class DiseaseController {
  constructor(private readonly diseaseService: DiseaseService) {}

  // Admin only - create new disease
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(@Body() createDiseaseDto: CreateDiseaseDto) {
    return this.diseaseService.create(createDiseaseDto);
  }

  // Public - get all active diseases
  @Get()
  async findAll() {
    return this.diseaseService.findAll();
  }

  // Public - search diseases
  @Get('search')
  async search(@Query('query') query: string) {
    if (!query || query.trim().length === 0) {
      return this.diseaseService.findAll();
    }
    return this.diseaseService.search(query);
  }

  // Public - get disease by ID
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.diseaseService.findOne(id);
  }

  // Admin only - update disease
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDiseaseDto: UpdateDiseaseDto,
  ) {
    return this.diseaseService.update(id, updateDiseaseDto);
  }

  // Admin only - delete disease
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.diseaseService.remove(id);
    return { message: 'Disease deleted successfully' };
  }
}
