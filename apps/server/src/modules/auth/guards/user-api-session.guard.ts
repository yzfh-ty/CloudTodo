import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseCookies } from '../../../common/http/cookie.util';
import { CsrfService } from '../../../common/security/csrf.service';
import { IS_PUBLIC_KEY } from '../../admin/decorators/public.decorator';
import { UserSessionService } from '../user-session.service';
import { ALLOW_PASSWORD_CHANGE_SESSION_KEY } from '../decorators/allow-password-change-session.decorator';

type RequestWithUser = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
};

@Injectable()
export class UserApiSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userSessionService: UserSessionService,
    private readonly csrfService: CsrfService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const rawCookieHeader = request.headers.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const cookies = parseCookies(cookieHeader);
    this.csrfService.assertValidRequest(
      request,
      cookies,
      CsrfService.USER_COOKIE_NAME,
      'user',
    );
    const user = await this.userSessionService.authenticate(
      cookies[UserSessionService.COOKIE_NAME],
    );

    if (!user) {
      throw new UnauthorizedException();
    }

    const allowsPasswordChangeSession = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_SESSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (user.forcePasswordChange && !allowsPasswordChangeSession) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'password change is required before using this resource',
      });
    }

    request.user = user;
    return true;
  }
}
