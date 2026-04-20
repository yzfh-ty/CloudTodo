import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { hashPassword, verifyPassword } from '../../common/security/password.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserSessionService } from './user-session.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();

    const [emailExists, usernameExists] = await this.prisma.$transaction([
      this.prisma.user.findFirst({
        where: { email },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: { username },
        select: { id: true },
      }),
    ]);

    if (emailExists) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'email is already in use',
      });
    }

    if (usernameExists) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'username is already in use',
      });
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hashPassword(dto.password),
        nickname: dto.nickname?.trim() || username,
        role: UserRole.user,
        status: UserStatus.active,
        timezone: dto.timezone?.trim() || 'Asia/Shanghai',
      },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        timezone: true,
        createdAt: true,
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        user,
      },
    };
  }

  async login(dto: LoginDto) {
    const account = dto.account.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: account.toLowerCase() }, { username: account }],
      },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        timezone: true,
        lastLoginAt: true,
        passwordHash: true,
      },
    });

    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid user credentials',
      });
    }

    if (!verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid user credentials',
      });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        timezone: true,
        lastLoginAt: true,
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        user: updatedUser,
      },
    };
  }

  async issueRefreshToken(userId: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + UserSessionService.REFRESH_TTL_SECONDS * 1000,
    );

    await this.prisma.authRefreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      refreshToken,
      expiresAt,
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const existingToken = await this.prisma.authRefreshToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            role: true,
            status: true,
            timezone: true,
            lastLoginAt: true,
          },
        },
      },
    });

    if (
      !existingToken ||
      existingToken.revokedAt ||
      existingToken.expiresAt <= new Date() ||
      existingToken.user.status !== UserStatus.active
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'refresh token is invalid',
      });
    }

    const newRefreshToken = randomBytes(32).toString('base64url');
    const newTokenHash = this.hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + UserSessionService.REFRESH_TTL_SECONDS * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.authRefreshToken.update({
        where: {
          id: existingToken.id,
        },
        data: {
          revokedAt: new Date(),
          revokeReason: 'rotated',
        },
      }),
      this.prisma.authRefreshToken.create({
        data: {
          userId: existingToken.user.id,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      }),
      this.prisma.user.update({
        where: {
          id: existingToken.user.id,
        },
        data: {
          lastLoginAt: new Date(),
        },
      }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        user: existingToken.user,
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt: newExpiresAt,
      },
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return {
        code: 'OK',
        message: 'success',
        data: null,
      };
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.prisma.authRefreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: 'logout',
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: null,
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
