import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { parseCookies, serializeCookie } from '../../common/http/cookie.util';
import { Public } from '../admin/decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { UserSessionService } from './user-session.service';

type ResponseLike = {
  setHeader: (name: string, value: string | string[]) => void;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userSessionService: UserSessionService,
  ) {}

  @Post('register')
  @Public()
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: ResponseLike) {
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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: ResponseLike) {
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
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const cookies = parseCookies(cookieHeader);
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

  private createAuthCookies(sessionToken: string, refreshToken: string): string[] {
    return [
      serializeCookie(UserSessionService.COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
        path: '/',
        maxAge: UserSessionService.SESSION_TTL_SECONDS,
      }),
      serializeCookie(UserSessionService.REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
        path: '/',
        maxAge: UserSessionService.REFRESH_TTL_SECONDS,
      }),
    ];
  }

  private clearAuthCookies(): string[] {
    return [
      serializeCookie(UserSessionService.COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
        path: '/',
        maxAge: 0,
      }),
      serializeCookie(UserSessionService.REFRESH_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
        path: '/',
        maxAge: 0,
      }),
    ];
  }
}
