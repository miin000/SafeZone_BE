import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { User } from '../auth/entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuditLog])],
  controllers: [AdminController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AdminModule {}
