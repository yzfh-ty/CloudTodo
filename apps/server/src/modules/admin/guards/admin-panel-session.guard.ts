import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseCookies } from '../../../common/http/cookie.util';
import { AdminSessionService } from '../admin-session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  admin?: unknown;
};

type ResponseLike = {
  redirect: (url: string) => void;
};

@Injectable()
export class AdminPanelSessionGuard implements CanActivate {
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

    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();
    const rawCookieHeader = request.headers.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const cookies = parseCookies(cookieHeader);

    try {
      request.admin = await this.adminSessionService.authenticate(
        cookies[AdminSessionService.COOKIE_NAME],
      );
      return true;
    } catch {
      response.redirect('/admin/login');
      return false;
    }
  }
}
