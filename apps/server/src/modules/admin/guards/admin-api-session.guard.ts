import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseCookies } from '../../../common/http/cookie.util';
import { AdminSessionService } from '../admin-session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

type RequestWithAdmin = {
  headers: Record<string, string | string[] | undefined>;
  admin?: unknown;
};

@Injectable()
export class AdminApiSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminSessionService: AdminSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const rawCookieHeader = request.headers.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const cookies = parseCookies(cookieHeader);

    const admin = await this.adminSessionService.authenticate(
      cookies[AdminSessionService.COOKIE_NAME],
    );

    if (!admin) {
      throw new UnauthorizedException();
    }

    request.admin = admin;
    return true;
  }
}
