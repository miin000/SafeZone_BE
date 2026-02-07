import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { HealthInfoService } from './health-info.service';
import {
  CreateHealthInfoDto,
  UpdateHealthInfoDto,
  QueryHealthInfoDto,
} from './dto';

@Controller('health-info')
export class HealthInfoController {
  constructor(private readonly healthInfoService: HealthInfoService) {}

  // ========== PUBLIC ENDPOINTS ==========

  /**
   * Lấy danh sách thông tin y tế đã xuất bản (public)
   */
  @Get('public')
  findPublished(@Query() query: QueryHealthInfoDto) {
    return this.healthInfoService.findPublished(query);
  }

  /**
   * Lấy danh sách thông tin nổi bật (public)
   */
  @Get('public/featured')
  findFeatured(@Query('limit') limit?: number) {
    return this.healthInfoService.findFeatured(limit);
  }

  /**
   * Lấy thông tin theo danh mục (public)
   */
  @Get('public/category/:category')
  findByCategory(
    @Param('category') category: string,
    @Query('limit') limit?: number,
  ) {
    return this.healthInfoService.findByCategory(category, limit);
  }

  /**
   * Xem chi tiết thông tin y tế (public, tăng view count)
   */
  @Get('public/:id')
  findOnePublished(@Param('id', ParseUUIDPipe) id: string) {
    return this.healthInfoService.findOnePublished(id);
  }

  // ========== ADMIN ENDPOINTS (Cần đăng nhập) ==========

  /**
   * Lấy thống kê (admin) - MUST BE BEFORE @Get()
   */
  @Get('stats')
  @UseGuards(AuthGuard('jwt'))
  getStats() {
    return this.healthInfoService.getStats();
  }

  /**
   * Lấy tất cả thông tin y tế (admin)
   */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Query() query: QueryHealthInfoDto) {
    return this.healthInfoService.findAll(query);
  }

  /**
   * Xem chi tiết (admin)
   */
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.healthInfoService.findOne(id);
  }

  /**
   * Tạo mới thông tin y tế (admin + health authority)
   */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  create(@Body() createDto: CreateHealthInfoDto, @Request() req) {
    return this.healthInfoService.create(createDto, req.user.id);
  }

  /**
   * Cập nhật thông tin y tế (admin + health authority)
   */
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateHealthInfoDto,
  ) {
    return this.healthInfoService.update(id, updateDto);
  }

  /**
   * Xuất bản thông tin y tế (admin + health authority)
   */
  @Patch(':id/publish')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.healthInfoService.publish(id);
  }

  /**
   * Lưu trữ (ẩn) thông tin y tế (admin + health authority)
   */
  @Patch(':id/archive')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.healthInfoService.archive(id);
  }

  /**
   * Xóa thông tin y tế (chỉ admin)
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.healthInfoService.remove(id);
  }
}
