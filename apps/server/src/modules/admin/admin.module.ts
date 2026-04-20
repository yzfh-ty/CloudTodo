import { Module } from '@nestjs/common';
import { AdminSessionService } from './admin-session.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminApiSessionGuard } from './guards/admin-api-session.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminSessionService, AdminApiSessionGuard],
  exports: [AdminSessionService, AdminApiSessionGuard],
})
export class AdminModule {}
