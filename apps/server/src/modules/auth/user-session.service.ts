import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';

interface UserSessionPayload {
  sub: string;
  role: UserRole;
  iat: number;
  iatMs: number;
  exp: number;
  passwordChangeOnly?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  timezone: string;
  forcePasswordChange: boolean;
}

@Injectable()
export class UserSessionService {
  static readonly COOKIE_NAME = 'cloudtodo_user_session';
  static readonly REFRESH_COOKIE_NAME = 'cloudtodo_user_refresh_token';
  // Access tokens are deliberately short lived. The server-side revocation
  // marker below still handles immediate logout and account security events.
  static readonly SESSION_TTL_SECONDS = 15 * 60;
  static readonly PASSWORD_CHANGE_SESSION_TTL_SECONDS = 10 * 60;
  static readonly REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createSessionToken(
    userId: string,
    role: UserRole,
    options: { passwordChangeOnly?: boolean; issuedAtMs?: number } = {},
  ): string {
    const issuedAtMs = options.issuedAtMs ?? Date.now();
    const nowSeconds = Math.floor(issuedAtMs / 1000);
    const passwordChangeOnly = options.passwordChangeOnly === true;
    const payload: UserSessionPayload = {
      sub: userId,
      role,
      iat: nowSeconds,
      iatMs: issuedAtMs,
      exp:
        nowSeconds +
        (passwordChangeOnly
          ? UserSessionService.PASSWORD_CHANGE_SESSION_TTL_SECONDS
          : UserSessionService.SESSION_TTL_SECONDS),
      ...(passwordChangeOnly ? { passwordChangeOnly: true } : {}),
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  async authenticate(token?: string): Promise<AuthenticatedUser> {
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'user session is required',
      });
    }

    const payload = this.verifyToken(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        timezone: true,
        forcePasswordChange: true,
        passwordChangedAt: true,
        sessionRevokedAt: true,
      },
    });

    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'user session is invalid',
      });
    }

    if (user.passwordChangedAt) {
      const issuedAtMs = payload.iatMs ?? payload.iat * 1000;
      if (issuedAtMs <= user.passwordChangedAt.getTime()) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'user session is no longer valid',
        });
      }
    }

    if (
      user.sessionRevokedAt &&
      (payload.iatMs
        ? payload.iatMs <= user.sessionRevokedAt.getTime()
        : payload.iat <= Math.floor(user.sessionRevokedAt.getTime() / 1000))
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'user session has been revoked',
      });
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      status: user.status,
      timezone: user.timezone,
      forcePasswordChange: user.forcePasswordChange,
    };
  }

  private verifyToken(token: string): UserSessionPayload {
    const [encodedPayload, providedSignature] = token.split('.');

    if (!encodedPayload || !providedSignature) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid user session token',
      });
    }

    const expectedSignature = this.sign(encodedPayload);
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid user session signature',
      });
    }

    let payload: UserSessionPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as UserSessionPayload;
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid user session token',
      });
    }
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (
      !payload.sub ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number' ||
      payload.exp <= nowSeconds
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'user session has expired',
      });
    }

    return payload;
  }

  private sign(encodedPayload: string): string {
    const secret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ?? process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }

    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }
}
