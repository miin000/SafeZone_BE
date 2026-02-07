import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Put,
  Delete,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, User } from '../auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto, UpdateUserDto } from '../auth/dto/user-management.dto';
import { AuditLogService } from './audit-log.service';
import { AuditAction, AuditResource } from './entities/audit-log.entity';

@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Migrate role enum (one-time migration)
   */
  @Post('migrate-roles')
  async migrateRoles() {
    try {
      // Add new enum value
      await this.dataSource.query(
        "ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'health_authority'",
      );
      
      // Update existing data
      const result = await this.dataSource.query(
        "UPDATE users SET role = 'health_authority' WHERE role = 'health_worker'",
      );

      return {
        success: true,
        message: 'Role migration completed',updated: result[1],
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * List all admin and health authority users
   */
  @Get('users/staff')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async listAdminUsers() {
    return this.userRepository.find({
      where: [{ role: UserRole.ADMIN }, { role: UserRole.HEALTH_AUTHORITY }],
      select: ['id', 'email', 'name', 'phone', 'role', 'isActive', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List all users with optional filtering
   */
  @Get('users')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async listUsers(@Query('role') role?: string) {
    const where: any = {};
    if (role && role !== 'ALL') {
      where.role = role as UserRole;
    }

    const users = await this.userRepository.find({
      where,
      select: ['id', 'email', 'name', 'phone', 'role', 'isActive', 'createdAt', 'updatedAt', 'lastLoginAt'],
      order: { createdAt: 'DESC' },
    });

    return users;
  }

  /**
   * Get user by ID
   */
  @Get('users/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_AUTHORITY)
  async getUserById(@Param('id') id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'email', 'name', 'phone', 'role', 'isActive', 'isEmailVerified', 'isPhoneVerified', 'createdAt', 'updatedAt', 'lastLoginAt'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user
   */
  @Put('users/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateUser(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if email/phone already exists for another user
    if (updateDto.email && updateDto.email !== user.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: updateDto.email },
      });
      if (existingEmail && existingEmail.id !== id) {
        throw new BadRequestException('Email already exists');
      }
    }

    if (updateDto.phone && updateDto.phone !== user.phone) {
      const existingPhone = await this.userRepository.findOne({
        where: { phone: updateDto.phone },
      });
      if (existingPhone && existingPhone.id !== id) {
        throw new BadRequestException('Phone already exists');
      }
    }

    // Hash password if provided
    if (updateDto.password) {
      updateDto.password = await bcrypt.hash(updateDto.password, 10);
    }

    // Update user
    Object.assign(user, updateDto);
    await this.userRepository.save(user);

    delete user.password;
    return user;
  }

  /**
   * Delete/deactivate user
   */
  @Delete('users/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('id') id: string) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete by deactivating
    user.isActive = false;
    await this.userRepository.save(user);

    return { success: true, message: 'User deactivated successfully' };
  }

  /**
   * Create any user (admin, health_authority, or regular user)
   */
  @Post('users')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async createUser(@Body() createDto: CreateUserDto) {
    // Check if phone or email already exists
    const existing = await this.userRepository.findOne({
      where: [{ phone: createDto.phone }, { email: createDto.email }],
    });

    if (existing) {
      throw new BadRequestException('Phone or email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createDto.password, 10);

    // Create user
    const user = this.userRepository.create({
      email: createDto.email,
      password: hashedPassword,
      name: createDto.name,
      phone: createDto.phone,
      role: createDto.role,
      isActive: createDto.isActive !== false,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    await this.userRepository.save(user);

    delete user.password;
    return user;
  }

  /**
   * Bootstrap: Create first admin account (no auth required, only works if no admin exists)
   */
  @Post('bootstrap')
  async bootstrapAdmin(
    @Body() body: {
      email: string;
      password: string;
      name: string;
      phone: string;
    },
  ) {
    // Check if any admin exists
    const adminExists = await this.userRepository.findOne({
      where: { role: UserRole.ADMIN },
    });

    if (adminExists) {
      throw new Error('Admin already exists. Use regular create endpoint.');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(body.password, 10);

    // Create first admin
    const admin = this.userRepository.create({
      email: body.email,
      password: hashedPassword,
      name: body.name,
      phone: body.phone,
      role: UserRole.ADMIN,
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    await this.userRepository.save(admin);

    delete admin.password;
    return {
      success: true,
      message: 'First admin account created successfully',
      admin,
    };
  }

  /**
   * Get audit logs
   */
  @Get('audit-logs')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAuditLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: AuditAction,
    @Query('resource') resource?: AuditResource,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogService.findAll({
      userId,
      action,
      resource,
      page: page ? parseInt(String(page)) : 1,
      limit: limit ? parseInt(String(limit)) : 50,
    });
  }

  /**
   * Get recent audit activity
   */
  @Get('audit-logs/recent')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async getRecentActivity(
    @Query('userId') userId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogService.getRecentActivity(
      userId,
      limit ? parseInt(String(limit)) : 20,
    );
  }

  /**
   * Get audit log statistics
   */
  @Get('audit-logs/stats')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAuditStats() {
    return this.auditLogService.getStats({});
  }
}
