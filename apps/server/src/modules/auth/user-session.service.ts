import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';

interface UserSessionPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  timezone: string;
}

@Injectable()
export class UserSessionService {
  static readonly COOKIE_NAME = 'cloudtodo_user_session';
  static readonly REFRESH_COOKIE_NAME = 'cloudtodo_user_refresh_token';
  static readonly SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
  static readonly REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createSessionToken(userId: string, role: UserRole): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: UserSessionPayload = {
      sub: userId,
      role,
      iat: nowSeconds,
      exp: nowSeconds + UserSessionService.SESSION_TTL_SECONDS,
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
        passwordChangedAt: true,
      },
    });

    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'user session is invalid',
      });
    }

    if (user.passwordChangedAt) {
      const passwordChangedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat <= passwordChangedAtSeconds) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'user session is no longer valid',
        });
      }
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      status: user.status,
      timezone: user.timezone,
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

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as UserSessionPayload;
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!payload.sub || payload.exp <= nowSeconds) {
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
