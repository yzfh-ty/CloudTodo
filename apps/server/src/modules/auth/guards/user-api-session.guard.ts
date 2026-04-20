import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseCookies } from '../../../common/http/cookie.util';
import { IS_PUBLIC_KEY } from '../../admin/decorators/public.decorator';
import { UserSessionService } from '../user-session.service';

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
};

@Injectable()
export class UserApiSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userSessionService: UserSessionService,
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
    const user = await this.userSessionService.authenticate(
      cookies[UserSessionService.COOKIE_NAME],
    );

    if (!user) {
      throw new UnauthorizedException();
    }

    request.user = user;
    return true;
  }
}
