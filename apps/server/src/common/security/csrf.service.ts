import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type CsrfRequestLike = {
  method?: string;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class CsrfService {
  static readonly HEADER_NAME = 'x-csrf-token';
  static readonly USER_COOKIE_NAME = 'cloudtodo_user_csrf_token';
  static readonly ADMIN_COOKIE_NAME = 'cloudtodo_admin_csrf_token';

  constructor(private readonly configService: ConfigService) {}

  createToken(scope: 'user' | 'admin') {
    const nonce = randomBytes(32).toString('base64url');
    const signature = this.sign(scope, nonce);
    return `${nonce}.${signature}`;
  }

  assertValidRequest(
    request: CsrfRequestLike,
    cookies: Record<string, string>,
    cookieName: string,
    scope: 'user' | 'admin',
  ) {
    if (this.isSafeMethod(request.method)) {
      return;
    }

    const cookieToken = cookies[cookieName];
    const headerToken = this.getHeader(request, CsrfService.HEADER_NAME);
    if (cookieToken) {
      if (!headerToken || headerToken !== cookieToken || !this.verifyToken(scope, cookieToken)) {
        throw new ForbiddenException({
          code: 'CSRF_TOKEN_INVALID',
          message: 'csrf token is invalid',
        });
      }
      return;
    }

    this.assertTrustedOrigin(request);
  }

  /** Login and other public cookie-setting endpoints must still reject cross-site requests. */
  assertTrustedOriginForPublicRequest(request: CsrfRequestLike) {
    // Native clients do not send browser origin headers. Browser requests that
    // carry an Origin/Referer must be checked against the explicit allow-list.
    if (!this.getHeader(request, 'origin') && !this.getHeader(request, 'referer')) {
      if (this.getHeader(request, 'sec-fetch-site')) {
        throw new ForbiddenException({
          code: 'CSRF_ORIGIN_REQUIRED',
          message: 'request origin is required',
        });
      }
      return;
    }
    this.assertTrustedOrigin(request);
  }

  private verifyToken(scope: 'user' | 'admin', token: string) {
    const [nonce, signature] = token.split('.');
    if (!nonce || !signature) {
      return false;
    }

    const expected = this.sign(scope, nonce);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private sign(scope: 'user' | 'admin', nonce: string) {
    return createHmac('sha256', this.getSecret())
      .update(`${scope}:${nonce}`)
      .digest('base64url');
  }

  private getSecret() {
    const secret = this.configService.get<string>('CSRF_SECRET');

    if (!secret) {
      throw new Error('CSRF_SECRET is required');
    }

    return secret;
  }

  private isSafeMethod(method?: string) {
    return !method || ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }

  private assertTrustedOrigin(request: CsrfRequestLike) {
    const origin = this.getHeader(request, 'origin');
    const referer = this.getHeader(request, 'referer');
    const candidate = origin || referer;

    if (!candidate) {
      throw new ForbiddenException({
        code: 'CSRF_ORIGIN_REQUIRED',
        message: 'request origin is required',
      });
    }

    let candidateOrigin: string;
    try {
      candidateOrigin = new URL(candidate).origin;
    } catch {
      throw new ForbiddenException({
        code: 'CSRF_ORIGIN_INVALID',
        message: 'request origin is invalid',
      });
    }

    if (!this.trustedOrigins(request).has(candidateOrigin)) {
      throw new ForbiddenException({
        code: 'CSRF_ORIGIN_FORBIDDEN',
        message: 'request origin is not allowed',
      });
    }
  }

  private trustedOrigins(request: CsrfRequestLike) {
    const origins = new Set<string>();
    const appBaseUrl = this.configService.get<string>('APP_BASE_URL');
    if (appBaseUrl) {
      this.addTrustedOrigin(origins, appBaseUrl);
    }

    const configured = this.configService.get<string>('CSRF_TRUSTED_ORIGINS');
    for (const value of configured?.split(',') ?? []) {
      const trimmed = value.trim();
      if (trimmed) {
        this.addTrustedOrigin(origins, trimmed);
      }
    }

    const corsOrigins = this.configService.get<string>('CORS_ORIGINS');
    for (const value of corsOrigins?.split(',') ?? []) {
      const trimmed = value.trim();
      if (trimmed) {
        this.addTrustedOrigin(origins, trimmed);
      }
    }

    const useForwardedHeaders = this.isTrustedProxy(request);
    // A Host/X-Forwarded-Host value supplied by an untrusted client must never
    // become a trusted origin. Canonical APP_BASE_URL/CORS_ORIGINS are the
    // allow-list; proxy headers are only useful for deployments that explicitly
    // configure the proxy address and an origin already present in that list.
    if (useForwardedHeaders) {
      const host = this.getHeader(request, 'x-forwarded-host');
      const proto = this.getHeader(request, 'x-forwarded-proto');
      const normalizedProto = proto?.split(',')[0].trim().toLowerCase();
      const candidate = host && (normalizedProto === 'http' || normalizedProto === 'https')
        ? `${normalizedProto}://${host.split(',')[0].trim()}`
        : undefined;
      if (candidate && origins.has(candidate)) {
        origins.add(candidate);
      }
    }

    return origins;
  }

  private addTrustedOrigin(origins: Set<string>, value: string) {
    try {
      origins.add(new URL(value).origin);
    } catch {
      return;
    }
  }

  private getHeader(request: CsrfRequestLike, name: string) {
    const value = request.headers[name] ?? request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private isTrustedProxy(request: CsrfRequestLike) {
    const remote = request.socket?.remoteAddress ?? request.ip;
    if (!remote) {
      return false;
    }
    const configured = (this.configService.get<string>('TRUSTED_PROXY_IPS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return configured.includes(remote) || configured.includes(remote.replace(/^::ffff:/i, ''));
  }
}
