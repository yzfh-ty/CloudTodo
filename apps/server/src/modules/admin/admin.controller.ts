import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { serializeCookie } from '../../common/http/cookie.util';
import { CsrfService } from '../../common/security/csrf.service';
import { RateLimitService } from '../../common/security/rate-limit.service';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { AllowAdminPasswordChangeSession } from './decorators/allow-admin-password-change-session.decorator';
import { RequireRecentAdminAuth } from './decorators/require-recent-admin-auth.decorator';
import { Public } from './decorators/public.decorator';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminOperationLogQueryDto } from './dto/admin-operation-log-query.dto';
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
  setHeader: (name: string, value: string | string[]) => void;
};

type RequestLike = {
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  headers: Record<string, string | string[] | undefined>;
};

@Controller('admin')
@UseGuards(AdminApiSessionGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminSessionService: AdminSessionService,
    private readonly csrfService: CsrfService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Post('auth/login')
  @Public()
  async login(
    @Req() req: RequestLike,
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    this.csrfService.assertTrustedOriginForPublicRequest(req);
    this.assertRateLimit(req, 'login', dto.account, 8, 15 * 60 * 1000);
    const result = await this.adminService.login(dto);
    const token = this.adminSessionService.createSessionToken(result.data.admin.id, {
      passwordChangeOnly: result.data.admin.forcePasswordChange,
      issuedAtMs: result.data.admin.lastLoginAt.getTime(),
    });

    res.setHeader(
      'Set-Cookie',
      this.createAdminCookies(token, result.data.admin.forcePasswordChange),
    );

    return result;
  }

  @Post('auth/logout')
  @AllowAdminPasswordChangeSession()
  async logout(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    await this.adminService.logout(admin);
    res.setHeader(
      'Set-Cookie',
      this.clearAdminCookies(),
    );

    return {
      code: 'OK',
      message: 'success',
      data: null,
    };
  }

  @Post('auth/change-password')
  @RequireRecentAdminAuth()
  @AllowAdminPasswordChangeSession()
  changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: AdminChangePasswordDto,
  ) {
    return this.adminService.changePassword(admin, dto);
  }

  @Post('auth/logout-all-sessions')
  @RequireRecentAdminAuth()
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
  @RequireRecentAdminAuth()
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
  @RequireRecentAdminAuth()
  updateUser(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.adminService.updateUser(admin, id, dto);
  }

  @Post('users/:id/disable')
  @RequireRecentAdminAuth()
  disableUser(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: AdminUserActionDto,
  ) {
    return this.adminService.disableUser(admin, id, dto.reason ?? '');
  }

  @Post('users/:id/enable')
  @RequireRecentAdminAuth()
  enableUser(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: AdminUserActionDto,
  ) {
    return this.adminService.enableUser(admin, id, dto.reason);
  }

  @Post('users/:id/reset-password')
  @RequireRecentAdminAuth()
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
  getOperationLogs(@Query() query: AdminOperationLogQueryDto) {
    return this.adminService.getOperationLogs(query);
  }

  private createAdminCookies(token: string, passwordChangeOnly = false) {
    const secure = this.useSecureCookies();
    return [
      serializeCookie(AdminSessionService.COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: passwordChangeOnly
          ? AdminSessionService.PASSWORD_CHANGE_SESSION_TTL_SECONDS
          : AdminSessionService.SESSION_TTL_SECONDS,
      }),
      serializeCookie(CsrfService.ADMIN_COOKIE_NAME, this.csrfService.createToken('admin'), {
        httpOnly: false,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: passwordChangeOnly
          ? AdminSessionService.PASSWORD_CHANGE_SESSION_TTL_SECONDS
          : AdminSessionService.SESSION_TTL_SECONDS,
      }),
    ];
  }

  private clearAdminCookies() {
    const secure = this.useSecureCookies();
    return [
      serializeCookie(AdminSessionService.COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: 0,
      }),
      serializeCookie(CsrfService.ADMIN_COOKIE_NAME, '', {
        httpOnly: false,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: 0,
      }),
    ];
  }

  private useSecureCookies() {
    const configured = this.configService.get<string>('COOKIE_SECURE');
    if (configured !== undefined) {
      return configured === 'true';
    }

    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private assertRateLimit(
    request: RequestLike,
    action: string,
    identifier: string | undefined,
    limit: number,
    windowMs: number,
  ) {
    const clientKey = this.rateLimitService.clientKey(request);
    this.rateLimitService.assertAllowed(
      `admin:${action}:ip:${clientKey}`,
      limit,
      windowMs,
    );

    if (identifier?.trim()) {
      this.rateLimitService.assertAllowed(
        `admin:${action}:id:${identifier.trim().toLowerCase()}`,
        limit,
        windowMs,
      );
    }
  }
}
