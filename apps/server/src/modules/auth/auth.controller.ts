import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseCookies, serializeCookie } from '../../common/http/cookie.util';
import { CsrfService } from '../../common/security/csrf.service';
import { RateLimitService } from '../../common/security/rate-limit.service';
import { Public } from '../admin/decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AllowPasswordChangeSession } from './decorators/allow-password-change-session.decorator';
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
  method?: string;
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
    this.csrfService.assertTrustedOriginForPublicRequest(req);
    await this.assertRateLimit(req, 'register', dto.email, 10, 15 * 60 * 1000);
    const result = await this.authService.register(dto);
    const token = this.userSessionService.createSessionToken(
      result.data.user.id,
      result.data.user.role,
      { issuedAtMs: result.data.user.createdAt.getTime() },
    );
    const refresh = await this.authService.issueRefreshToken(
      result.data.user.id,
      result.data.user.createdAt,
    );

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
    this.csrfService.assertTrustedOriginForPublicRequest(req);
    await this.assertRateLimit(req, 'login', dto.account, 10, 15 * 60 * 1000);
    const result = await this.authService.login(dto);
    const token = this.userSessionService.createSessionToken(
      result.data.user.id,
      result.data.user.role,
      {
        passwordChangeOnly: result.data.user.forcePasswordChange,
        issuedAtMs: result.data.user.lastLoginAt.getTime(),
      },
    );
    const refresh = result.data.user.forcePasswordChange
      ? null
      : await this.authService.issueRefreshToken(
          result.data.user.id,
          result.data.user.lastLoginAt,
        );

    res.setHeader(
      'Set-Cookie',
      this.createAuthCookies(token, refresh?.refreshToken, result.data.user.forcePasswordChange),
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
    await this.assertRateLimit(req, 'refresh', undefined, 60, 15 * 60 * 1000);
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
      {
        passwordChangeOnly: result.data.user.forcePasswordChange,
        issuedAtMs: result.data.sessionIssuedAt.getTime(),
      },
    );

    res.setHeader(
      'Set-Cookie',
      this.createAuthCookies(
        sessionToken,
        result.data.refreshToken,
        result.data.user.forcePasswordChange,
      ),
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
  @Public()
  async logout(
    @Req() req: RequestLike,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const cookies = parseCookies(cookieHeader);
    this.csrfService.assertValidRequest(
      req,
      cookies,
      CsrfService.USER_COOKIE_NAME,
      'user',
    );
    await this.assertRateLimit(req, 'logout', undefined, 60, 15 * 60 * 1000);

    let authenticatedUserId: string | undefined;
    const sessionToken = cookies[UserSessionService.COOKIE_NAME];
    if (sessionToken) {
      try {
        authenticatedUserId = (await this.userSessionService.authenticate(sessionToken)).id;
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) {
          throw error;
        }
      }
    }

    const refreshToken = cookies[UserSessionService.REFRESH_COOKIE_NAME];
    await this.authService.logout(refreshToken, authenticatedUserId);

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
  @AllowPasswordChangeSession()
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }

  @Post('password-reset/confirm')
  @Public()
  async confirmPasswordReset(@Req() req: RequestLike, @Body() dto: ConfirmPasswordResetDto) {
    await this.assertRateLimit(req, 'password-reset-confirm', dto.token, 8, 15 * 60 * 1000);
    return this.authService.confirmPasswordReset(dto);
  }

  private createAuthCookies(
    sessionToken: string,
    refreshToken?: string,
    passwordChangeOnly = false,
  ): string[] {
    const secure = this.useSecureCookies();
    return [
      serializeCookie(UserSessionService.COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: passwordChangeOnly
          ? UserSessionService.PASSWORD_CHANGE_SESSION_TTL_SECONDS
          : UserSessionService.SESSION_TTL_SECONDS,
      }),
      serializeCookie(UserSessionService.REFRESH_COOKIE_NAME, refreshToken ?? '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: refreshToken ? UserSessionService.REFRESH_TTL_SECONDS : 0,
      }),
      serializeCookie(CsrfService.USER_COOKIE_NAME, this.csrfService.createToken('user'), {
        httpOnly: false,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: passwordChangeOnly
          ? UserSessionService.PASSWORD_CHANGE_SESSION_TTL_SECONDS
          : UserSessionService.REFRESH_TTL_SECONDS,
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

  private async assertRateLimit(
    request: RequestLike,
    action: string,
    identifier: string | undefined,
    limit: number,
    windowMs: number,
  ) {
    const clientKey = this.rateLimitService.clientKey(request);
    await this.rateLimitService.assertAllowedShared(
      `auth:${action}:ip:${clientKey}`,
      limit,
      windowMs,
    );

    if (identifier?.trim()) {
      await this.rateLimitService.assertAllowedShared(
        `auth:${action}:id:${identifier.trim().toLowerCase()}`,
        limit,
        windowMs,
      );
    }
  }
}
