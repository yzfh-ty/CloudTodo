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
import { AdminMfaService } from '../admin-mfa.service';
import { AdminSessionService } from '../admin-session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRE_MFA_CONFIRMATION_KEY } from '../decorators/require-mfa-confirmation.decorator';
import { REQUIRE_RECENT_ADMIN_AUTH_KEY } from '../decorators/require-recent-admin-auth.decorator';
import { ALLOW_ADMIN_PASSWORD_CHANGE_SESSION_KEY } from '../decorators/allow-admin-password-change-session.decorator';

type RequestWithAdmin = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  admin?: unknown;
};

@Injectable()
export class AdminApiSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminSessionService: AdminSessionService,
    private readonly adminMfaService: AdminMfaService,
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

    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const rawCookieHeader = request.headers.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const cookies = parseCookies(cookieHeader);
    this.csrfService.assertValidRequest(
      request,
      cookies,
      CsrfService.ADMIN_COOKIE_NAME,
      'admin',
    );

    const admin = await this.adminSessionService.authenticate(
      cookies[AdminSessionService.COOKIE_NAME],
    );

    if (!admin) {
      throw new UnauthorizedException();
    }

    const allowsPasswordChangeSession = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ADMIN_PASSWORD_CHANGE_SESSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (admin.forcePasswordChange && !allowsPasswordChangeSession) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'administrator password change is required',
      });
    }

    const maxAgeSeconds = this.reflector.getAllAndOverride<number | undefined>(
      REQUIRE_RECENT_ADMIN_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      maxAgeSeconds !== undefined &&
      (!admin.sessionIssuedAt || Date.now() - admin.sessionIssuedAt > maxAgeSeconds * 1000)
    ) {
      throw new ForbiddenException({
        code: 'RECENT_REAUTH_REQUIRED',
        message: 'recent administrator authentication is required',
      });
    }

    const requiresMfaConfirmation = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_MFA_CONFIRMATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiresMfaConfirmation) {
      const rawCode = request.headers['x-cloudtodo-mfa-code'];
      const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
      await this.adminMfaService.assertActionConfirmation(
        (admin as { id: string }).id,
        code,
      );
    }

    request.admin = admin;
    return true;
  }
}
