import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordResetMode, UserRole, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { hashPassword, verifyPassword } from '../../common/security/password.util';
import { hashResetToken } from '../../common/security/token-hash.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { UserSessionService } from './user-session.service';
import type { AuthenticatedUser } from './user-session.service';

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
        forcePasswordChange: true,
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
        forcePasswordChange: true,
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
        forcePasswordChange: true,
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

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'refresh token is invalid',
      });
    }

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
            forcePasswordChange: true,
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

  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto) {
    if (dto.new_password !== dto.confirm_password) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'password confirmation does not match',
      });
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!currentUser || !verifyPassword(dto.current_password, currentUser.passwordHash)) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'current password is invalid',
      });
    }

    const changedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(dto.new_password),
          passwordChangedAt: changedAt,
          forcePasswordChange: false,
        },
      }),
      this.prisma.authRefreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: changedAt,
          revokeReason: 'user_password_changed',
        },
      }),
      this.prisma.authPasswordResetToken.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: {
          consumedAt: changedAt,
        },
      }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        changed: true,
        changed_at: changedAt.toISOString(),
        reauth_required: true,
      },
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    if (dto.new_password !== dto.confirm_password) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'password confirmation does not match',
      });
    }

    const now = new Date();
    const tokenHash = hashResetToken(dto.token);
    const exactToken = await this.prisma.authPasswordResetToken.findFirst({
      where: {
        mode: PasswordResetMode.reset_token,
        tokenHash,
        consumedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    const matchedToken = exactToken ?? await this.findLegacyResetToken(dto.token, now);

    if (!matchedToken) {
      throw new BadRequestException({
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'password reset token is invalid or expired',
      });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: matchedToken.userId },
        data: {
          passwordHash: hashPassword(dto.new_password),
          passwordChangedAt: now,
          forcePasswordChange: false,
        },
      }),
      this.prisma.authRefreshToken.updateMany({
        where: {
          userId: matchedToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: 'password_reset_confirmed',
        },
      }),
      this.prisma.authPasswordResetToken.update({
        where: { id: matchedToken.id },
        data: {
          consumedAt: now,
        },
      }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        reset: true,
        changed_at: now.toISOString(),
      },
    };
  }

  private async findLegacyResetToken(token: string, now: Date) {
    const candidates = await this.prisma.authPasswordResetToken.findMany({
      where: {
        mode: PasswordResetMode.reset_token,
        consumedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
      select: {
        id: true,
        userId: true,
        tokenHash: true,
      },
    });
    return candidates.find((candidate) => verifyPassword(token, candidate.tokenHash));
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
