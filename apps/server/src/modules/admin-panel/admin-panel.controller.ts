import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { CurrentAdmin } from '../admin/decorators/current-admin.decorator';
import { Public } from '../admin/decorators/public.decorator';
import type { AuthenticatedAdmin } from '../admin/admin-session.service';
import { AdminPanelSessionGuard } from '../admin/guards/admin-panel-session.guard';
import { AdminPanelService } from './admin-panel.service';

@Controller()
@UseGuards(AdminPanelSessionGuard)
export class AdminPanelController {
  constructor(private readonly adminPanelService: AdminPanelService) {}

  @Get('admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  index(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.adminPanelService.renderIndex(admin);
  }

  @Get('admin/login')
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  login() {
    return this.adminPanelService.renderLogin();
  }
}
