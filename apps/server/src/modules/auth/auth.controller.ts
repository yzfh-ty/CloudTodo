import { Body, Controller, Headers, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseCookies, serializeCookie } from '../../common/http/cookie.util';
import { CsrfService } from '../../common/security/csrf.service';
import { RateLimitService } from '../../common/security/rate-limit.service';
import { Public } from '../admin/decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserApiSessionGuard } from './guards/user-api-session.guard';
import type { AuthenticatedUser } from './user-session.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { UserSessionService } from './user-session.service';

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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userSessionService: UserSessionService,
    private readonly csrfService: CsrfService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Post('register')
  @Public()
  async register(
    @Req() req: RequestLike,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    this.assertRateLimit(req, 'register', dto.email, 10, 15 * 60 * 1000);
    const result = await this.authService.register(dto);
    const token = this.userSessionService.createSessionToken(
      result.data.user.id,
      result.data.user.role,
    );
    const refresh = await this.authService.issueRefreshToken(result.data.user.id);

    res.setHeader(
      'Set-Cookie',
      this.createAuthCookies(token, refresh.refreshToken),
    );

    return result;
  }

  @Post('login')
  @Public()
  async login(
    @Req() req: RequestLike,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    this.assertRateLimit(req, 'login', dto.account, 10, 15 * 60 * 1000);
    const result = await this.authService.login(dto);
    const token = this.userSessionService.createSessionToken(
      result.data.user.id,
      result.data.user.role,
    );
    const refresh = await this.authService.issueRefreshToken(result.data.user.id);

    res.setHeader(
      'Set-Cookie',
      this.createAuthCookies(token, refresh.refreshToken),
    );

    return result;
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Req() req: RequestLike,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    this.assertRateLimit(req, 'refresh', undefined, 60, 15 * 60 * 1000);
    const cookies = parseCookies(cookieHeader);
    this.csrfService.assertValidRequest(
      req,
      cookies,
      CsrfService.USER_COOKIE_NAME,
      'user',
    );
    const refreshToken = cookies[UserSessionService.REFRESH_COOKIE_NAME];
    const result = await this.authService.refresh(refreshToken);
    const sessionToken = this.userSessionService.createSessionToken(
      result.data.user.id,
      result.data.user.role,
    );

    res.setHeader(
      'Set-Cookie',
      this.createAuthCookies(sessionToken, result.data.refreshToken),
    );

    return {
      code: result.code,
      message: result.message,
      data: {
        user: result.data.user,
      },
    };
  }

  @Post('logout')
  @UseGuards(UserApiSessionGuard)
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const cookies = parseCookies(cookieHeader);
    const refreshToken = cookies[UserSessionService.REFRESH_COOKIE_NAME];
    await this.authService.logout(refreshToken);

    res.setHeader(
      'Set-Cookie',
      this.clearAuthCookies(),
    );

    return {
      code: 'OK',
      message: 'success',
      data: null,
    };
  }

  @Post('change-password')
  @UseGuards(UserApiSessionGuard)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }

  @Post('password-reset/confirm')
  @Public()
  confirmPasswordReset(@Req() req: RequestLike, @Body() dto: ConfirmPasswordResetDto) {
    this.assertRateLimit(req, 'password-reset-confirm', dto.token, 8, 15 * 60 * 1000);
    return this.authService.confirmPasswordReset(dto);
  }

  private createAuthCookies(sessionToken: string, refreshToken: string): string[] {
    const secure = this.useSecureCookies();
    return [
      serializeCookie(UserSessionService.COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: UserSessionService.SESSION_TTL_SECONDS,
      }),
      serializeCookie(UserSessionService.REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: UserSessionService.REFRESH_TTL_SECONDS,
      }),
      serializeCookie(CsrfService.USER_COOKIE_NAME, this.csrfService.createToken('user'), {
        httpOnly: false,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: UserSessionService.REFRESH_TTL_SECONDS,
      }),
    ];
  }

  private clearAuthCookies(): string[] {
    const secure = this.useSecureCookies();
    return [
      serializeCookie(UserSessionService.COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: 0,
      }),
      serializeCookie(UserSessionService.REFRESH_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: 0,
      }),
      serializeCookie(CsrfService.USER_COOKIE_NAME, '', {
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
      `auth:${action}:ip:${clientKey}`,
      limit,
      windowMs,
    );

    if (identifier?.trim()) {
      this.rateLimitService.assertAllowed(
        `auth:${action}:id:${identifier.trim().toLowerCase()}`,
        limit,
        windowMs,
      );
    }
  }
}
