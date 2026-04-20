import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { serializeCookie } from '../../common/http/cookie.util';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { Public } from './decorators/public.decorator';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';
import { AdminUserActionDto } from './dto/admin-user-action.dto';
import {
  AdminSessionService,
  type AuthenticatedAdmin,
} from './admin-session.service';
import { AdminApiSessionGuard } from './guards/admin-api-session.guard';
import { AdminService } from './admin.service';

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
};

@Controller('admin')
@UseGuards(AdminApiSessionGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminSessionService: AdminSessionService,
  ) {}

  @Post('auth/login')
  @Public()
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: ResponseLike) {
    const result = await this.adminService.login(dto);
    const token = this.adminSessionService.createSessionToken(result.data.admin.id);

    res.setHeader(
      'Set-Cookie',
      serializeCookie(AdminSessionService.COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
        path: '/',
        maxAge: 60 * 60 * 8,
      }),
    );

    return result;
  }

  @Post('auth/logout')
  logout(@Res({ passthrough: true }) res: ResponseLike) {
    res.setHeader(
      'Set-Cookie',
      serializeCookie(AdminSessionService.COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
        path: '/',
        maxAge: 0,
      }),
    );

    return {
      code: 'OK',
      message: 'success',
      data: null,
    };
  }

  @Post('auth/change-password')
  changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: AdminChangePasswordDto,
  ) {
    return this.adminService.changePassword(admin, dto);
  }

  @Post('auth/logout-all-sessions')
  logoutAllSessions(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: AdminUserActionDto,
  ) {
    return this.adminService.logoutAllSessions(admin, dto.reason);
  }

  @Get('dashboard/summary')
  getDashboardSummary() {
    return this.adminService.getDashboardSummary();
  }

  @Get('users')
  getUsers(@Query() query: AdminUserListQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Post('users')
  createUser(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: AdminCreateUserDto,
  ) {
    return this.adminService.createUser(admin, dto);
  }

  @Get('users/:id')
  getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.adminService.updateUser(admin, id, dto);
  }

  @Post('users/:id/disable')
  disableUser(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: AdminUserActionDto,
  ) {
    return this.adminService.disableUser(admin, id, dto.reason ?? '');
  }

  @Post('users/:id/enable')
  enableUser(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: AdminUserActionDto,
  ) {
    return this.adminService.enableUser(admin, id, dto.reason);
  }

  @Post('users/:id/reset-password')
  resetPassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    return this.adminService.resetPassword(admin, id, dto);
  }

  @Get('users/:id/devices')
  getUserDevices(@Param('id') id: string) {
    return this.adminService.getUserDevices(id);
  }

  @Get('operation-logs')
  getOperationLogs(@Query() query: Record<string, string | number | undefined>) {
    return this.adminService.getOperationLogs(query);
  }
}
