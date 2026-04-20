import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';

interface AdminSessionPayload {
  sub: string;
  role: 'admin';
  iat: number;
  exp: number;
}

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
}

@Injectable()
export class AdminSessionService {
  static readonly COOKIE_NAME = 'cloudtodo_admin_session';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createSessionToken(adminId: string): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = 60 * 60 * 8;
    const payload: AdminSessionPayload = {
      sub: adminId,
      role: UserRole.admin,
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
    };

    const encodedPayload = this.encodePayload(payload);
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  async authenticate(token?: string): Promise<AuthenticatedAdmin> {
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'admin session is required',
      });
    }

    const payload = this.verifyToken(token);
    const admin = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        passwordChangedAt: true,
      },
    });

    if (!admin || admin.role !== UserRole.admin || admin.status !== UserStatus.active) {
      throw new UnauthorizedException({
        code: 'ADMIN_FORBIDDEN',
        message: 'admin session is invalid',
      });
    }

    if (admin.passwordChangedAt) {
      const passwordChangedAtSeconds = Math.floor(admin.passwordChangedAt.getTime() / 1000);
      if (payload.iat <= passwordChangedAtSeconds) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'admin session is no longer valid',
        });
      }
    }

    const latestLogoutAllSessions = await this.prisma.adminOperationLog.findFirst({
      where: {
        adminUserId: payload.sub,
        action: 'logout_all_sessions',
        result: 'success',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    if (latestLogoutAllSessions) {
      const logoutAllSessionsAt = Math.floor(
        latestLogoutAllSessions.createdAt.getTime() / 1000,
      );

      if (payload.iat <= logoutAllSessionsAt) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'admin session has been revoked',
        });
      }
    }

    return {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      nickname: admin.nickname,
      role: admin.role,
      status: admin.status,
    };
  }

  private verifyToken(token: string): AdminSessionPayload {
    const [encodedPayload, providedSignature] = token.split('.');

    if (!encodedPayload || !providedSignature) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid admin session token',
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
        message: 'invalid admin session signature',
      });
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as AdminSessionPayload;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds || payload.role !== UserRole.admin || !payload.sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'admin session has expired',
      });
    }

    return payload;
  }

  private encodePayload(payload: AdminSessionPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private sign(encodedPayload: string): string {
    const secret =
      this.configService.get<string>('ADMIN_SESSION_SECRET') ??
      process.env.ADMIN_SESSION_SECRET;

    if (!secret) {
      throw new Error('ADMIN_SESSION_SECRET is not configured');
    }

    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }
}
