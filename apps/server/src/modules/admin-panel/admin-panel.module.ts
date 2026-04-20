import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminPanelSessionGuard } from '../admin/guards/admin-panel-session.guard';
import { AdminPanelController } from './admin-panel.controller';
import { AdminPanelService } from './admin-panel.service';

@Module({
  imports: [AdminModule],
  controllers: [AdminPanelController],
  providers: [AdminPanelService, AdminPanelSessionGuard],
})
export class AdminPanelModule {}
