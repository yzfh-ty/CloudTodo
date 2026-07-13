import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type CsrfRequestLike = {
  method?: string;
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

    const host = this.getHeader(request, 'x-forwarded-host') || this.getHeader(request, 'host');
    if (host) {
      const proto = this.getHeader(request, 'x-forwarded-proto') ?? 'http';
      const normalizedProto = proto.split(',')[0].trim().toLowerCase();
      if (normalizedProto === 'http' || normalizedProto === 'https') {
        origins.add(`${normalizedProto}://${host.split(',')[0].trim()}`);
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
}
