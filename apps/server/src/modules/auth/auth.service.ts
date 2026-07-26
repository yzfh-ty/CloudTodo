import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordResetMode, Prisma, UserRole, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { hashPassword, verifyPassword } from '../../common/security/password.util';
import { hashResetToken } from '../../common/security/token-hash.util';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { UserSessionService } from './user-session.service';
import type { AuthenticatedUser } from './user-session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityAuditService: SecurityAuditService,
  ) {}

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
        timezone: 'Asia/Shanghai',
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

    void this.securityAuditService.record({
      action: 'user_register',
      result: 'success',
      actorUserId: user.id,
      targetUserId: user.id,
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
        passwordChangedAt: true,
        sessionRevokedAt: true,
        passwordHash: true,
        receivedPasswordResetTokens: {
          where: {
            mode: PasswordResetMode.temporary_password,
            consumedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            expiresAt: true,
            temporaryPasswordHash: true,
          },
        },
      },
    });

    if (!user || user.role !== UserRole.user || user.status !== UserStatus.active) {
      void this.securityAuditService.record({
        action: 'user_login_failure',
        result: 'failure',
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid user credentials',
      });
    }

    if (!verifyPassword(dto.password, user.passwordHash)) {
      void this.securityAuditService.record({
        action: 'user_login_failure',
        result: 'failure',
        targetUserId: user.id,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid user credentials',
      });
    }

    if (user.forcePasswordChange) {
      const temporaryPassword = user.receivedPasswordResetTokens[0];
      if (
        !temporaryPassword ||
        temporaryPassword.expiresAt <= new Date() ||
        temporaryPassword.temporaryPasswordHash !== user.passwordHash
      ) {
        void this.securityAuditService.record({
          action: 'user_login_failure',
          result: 'failure',
          targetUserId: user.id,
          metadata: { reason: 'temporary_password_expired' },
        });
        throw new UnauthorizedException({
          code: 'TEMPORARY_PASSWORD_EXPIRED',
          message: 'temporary password is expired; request a new reset',
        });
      }
    }

    const loginAt = this.nextSecurityTimestamp(
      user.passwordChangedAt,
      user.sessionRevokedAt,
    );
    const loginClaim = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        status: UserStatus.active,
        passwordChangedAt: user.passwordChangedAt,
        passwordHash: user.passwordHash,
        sessionRevokedAt: user.sessionRevokedAt,
        ...(user.forcePasswordChange
          ? {
              receivedPasswordResetTokens: {
                some: {
                  mode: PasswordResetMode.temporary_password,
                  consumedAt: null,
                  expiresAt: { gt: loginAt },
                  temporaryPasswordHash: user.passwordHash,
                },
              },
            }
          : {}),
      },
      data: { lastLoginAt: loginAt },
    });

    if (loginClaim.count !== 1) {
      void this.securityAuditService.record({
        action: 'user_login_failure',
        result: 'failure',
        targetUserId: user.id,
        metadata: { reason: 'credentials_changed_during_login' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'user credentials changed; please try again',
      });
    }

    const updatedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      status: user.status,
      timezone: user.timezone,
      forcePasswordChange: user.forcePasswordChange,
      lastLoginAt: loginAt,
    };

    void this.securityAuditService.record({
      action: 'user_login_success',
      result: 'success',
      actorUserId: updatedUser.id,
      targetUserId: updatedUser.id,
      metadata: { password_change_required: updatedUser.forcePasswordChange },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        user: updatedUser,
      },
    };
  }

  async issueRefreshToken(userId: string, sessionIssuedAt: Date) {
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashRefreshToken(refreshToken);

    const expiresAt = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await this.lockUser(tx, userId);
      if (
        !lockedUser ||
        lockedUser.status !== UserStatus.active ||
        lockedUser.forcePasswordChange ||
        (lockedUser.passwordChangedAt !== null &&
          lockedUser.passwordChangedAt >= sessionIssuedAt) ||
        (lockedUser.sessionRevokedAt !== null &&
          lockedUser.sessionRevokedAt >= sessionIssuedAt)
      ) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'credentials changed before the session was issued',
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { lastLoginAt: sessionIssuedAt },
      });

      const tokenExpiresAt = new Date(
        Math.max(Date.now(), sessionIssuedAt.getTime()) +
          UserSessionService.REFRESH_TTL_SECONDS * 1000,
      );
      await tx.authRefreshToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt: tokenExpiresAt,
        },
      });
      return tokenExpiresAt;
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

    const observedAt = new Date();
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
            passwordChangedAt: true,
            sessionRevokedAt: true,
          },
        },
      },
    });

    if (
      !existingToken ||
      existingToken.user.status !== UserStatus.active ||
      existingToken.user.forcePasswordChange ||
      (existingToken.user.passwordChangedAt !== null &&
        existingToken.createdAt <= existingToken.user.passwordChangedAt) ||
      (existingToken.user.sessionRevokedAt !== null &&
        existingToken.createdAt <= existingToken.user.sessionRevokedAt)
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'refresh token is invalid',
      });
    }

    if (existingToken.revokedAt) {
      if (existingToken.revokeReason === 'rotated') {
        await this.revokeRefreshTokensAfterReuse(existingToken.user.id);
      }
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'refresh token is invalid',
      });
    }

    if (existingToken.expiresAt <= observedAt) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'refresh token is invalid',
      });
    }

    const newRefreshToken = randomBytes(32).toString('base64url');
    const newTokenHash = this.hashRefreshToken(newRefreshToken);
    const rotation = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await this.lockUser(tx, existingToken.user.id);
      if (
        !lockedUser ||
        lockedUser.status !== UserStatus.active ||
        lockedUser.forcePasswordChange ||
        !this.sameTimestamp(
          lockedUser.passwordChangedAt,
          existingToken.user.passwordChangedAt,
        ) ||
        !this.sameTimestamp(
          lockedUser.sessionRevokedAt,
          existingToken.user.sessionRevokedAt,
        ) ||
        (lockedUser.passwordChangedAt !== null &&
          existingToken.createdAt <= lockedUser.passwordChangedAt) ||
        (lockedUser.sessionRevokedAt !== null &&
          existingToken.createdAt <= lockedUser.sessionRevokedAt)
      ) {
        return { kind: 'revoked' as const };
      }

      const rotationAt = this.nextSecurityTimestamp(
        lockedUser.sessionRevokedAt,
      );
      const newExpiresAt = new Date(
        rotationAt.getTime() + UserSessionService.REFRESH_TTL_SECONDS * 1000,
      );
      const claimed = await tx.authRefreshToken.updateMany({
        where: {
          id: existingToken.id,
          revokedAt: null,
          expiresAt: { gt: rotationAt },
        },
        data: {
          revokedAt: rotationAt,
          revokeReason: 'rotated',
        },
      });

      if (claimed.count !== 1) {
        await tx.user.update({
          where: { id: existingToken.user.id },
          data: { sessionRevokedAt: rotationAt },
        });
        await tx.authRefreshToken.updateMany({
          where: {
            userId: existingToken.user.id,
            revokedAt: null,
          },
          data: {
            revokedAt: rotationAt,
            revokeReason: 'refresh_token_reuse_detected',
          },
        });
        return { kind: 'reused' as const };
      }

      await tx.user.update({
        where: { id: existingToken.user.id },
        data: { lastLoginAt: rotationAt },
      });
      await tx.authRefreshToken.create({
        data: {
          userId: existingToken.user.id,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      });
      return { kind: 'rotated' as const, rotationAt, newExpiresAt };
    });

    if (rotation.kind === 'revoked') {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'refresh token is invalid',
      });
    }

    if (rotation.kind === 'reused') {
      await this.recordRefreshReuse(existingToken.user.id);
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'refresh token reuse was detected',
      });
    }

    void this.securityAuditService.record({
      action: 'user_refresh',
      result: 'success',
      actorUserId: existingToken.user.id,
      targetUserId: existingToken.user.id,
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        user: {
          ...existingToken.user,
          lastLoginAt: rotation.rotationAt,
        },
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt: rotation.newExpiresAt,
        sessionIssuedAt: rotation.rotationAt,
      },
    };
  }

  async logout(refreshToken?: string, authenticatedUserId?: string) {
    const tokenHash = refreshToken ? this.hashRefreshToken(refreshToken) : null;
    let targetUserId = authenticatedUserId;

    if (!targetUserId && tokenHash) {
      const tokenOwner = await this.prisma.authRefreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });
      targetUserId = tokenOwner?.userId;
    }

    let revokedUserId: string | undefined;
    if (targetUserId) {
      await this.prisma.$transaction(async (tx) => {
        const lockedUser = await this.lockUser(tx, targetUserId);
        if (!lockedUser) {
          return;
        }

        if (!authenticatedUserId) {
          if (!tokenHash) {
            return;
          }
          const submittedToken = await tx.authRefreshToken.findUnique({
            where: { tokenHash },
            select: {
              userId: true,
              revokedAt: true,
              revokeReason: true,
              expiresAt: true,
              createdAt: true,
            },
          });
          const observedAt = new Date();
          const isActive =
            submittedToken?.revokedAt === null &&
            submittedToken.expiresAt > observedAt;
          const isRotatedPredecessor =
            submittedToken?.revokeReason === 'rotated';
          if (
            !submittedToken ||
            submittedToken.userId !== targetUserId ||
            (!isActive && !isRotatedPredecessor) ||
            (lockedUser.passwordChangedAt !== null &&
              submittedToken.createdAt <= lockedUser.passwordChangedAt) ||
            (lockedUser.sessionRevokedAt !== null &&
              submittedToken.createdAt <= lockedUser.sessionRevokedAt)
          ) {
            return;
          }
        }

        const revokedAt = this.nextSecurityTimestamp(lockedUser.sessionRevokedAt);
        await tx.user.update({
          where: { id: targetUserId },
          data: { sessionRevokedAt: revokedAt },
        });
        await tx.authRefreshToken.updateMany({
          where: {
            userId: targetUserId,
            revokedAt: null,
          },
          data: {
            revokedAt,
            revokeReason: 'logout',
          },
        });
        revokedUserId = targetUserId;
      });
    }

    if (revokedUserId) {
      void this.securityAuditService.record({
        action: 'user_logout',
        result: 'success',
        actorUserId: revokedUserId,
        targetUserId: revokedUserId,
      });
    }

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
        passwordChangedAt: true,
        sessionRevokedAt: true,
      },
    });

    if (!currentUser || !verifyPassword(dto.current_password, currentUser.passwordHash)) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'current password is invalid',
      });
    }

    const nextPasswordHash = hashPassword(dto.new_password);
    const changedAt = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await this.lockUser(tx, user.id);
      const securityChangedAt = this.nextSecurityTimestamp(
        lockedUser?.passwordChangedAt,
        lockedUser?.sessionRevokedAt,
      );
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          status: UserStatus.active,
          passwordHash: currentUser.passwordHash,
          passwordChangedAt: currentUser.passwordChangedAt,
          sessionRevokedAt: currentUser.sessionRevokedAt,
        },
        data: {
          passwordHash: nextPasswordHash,
          passwordChangedAt: securityChangedAt,
          sessionRevokedAt: securityChangedAt,
          forcePasswordChange: false,
        },
      });
      if (changed.count !== 1) {
        throw new UnauthorizedException({
          code: 'INVALID_PASSWORD',
          message: 'credentials changed; please try again',
        });
      }
      await tx.authRefreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: securityChangedAt,
          revokeReason: 'user_password_changed',
        },
      });
      await tx.authPasswordResetToken.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: {
          consumedAt: securityChangedAt,
        },
      });
      return securityChangedAt;
    });

    void this.securityAuditService.record({
      action: 'password_change',
      result: 'success',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { forced: user.forcePasswordChange },
    });

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

    const observedAt = new Date();
    const tokenHash = hashResetToken(dto.token);
    const matchedToken = await this.prisma.authPasswordResetToken.findFirst({
      where: {
        mode: PasswordResetMode.reset_token,
        tokenHash,
        consumedAt: null,
        expiresAt: {
          gt: observedAt,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!matchedToken) {
      throw new BadRequestException({
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'password reset token is invalid or expired',
      });
    }

    const resetAt = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await this.lockUser(tx, matchedToken.userId);
      if (!lockedUser) {
        return null;
      }
      const confirmedAt = this.nextSecurityTimestamp(
        lockedUser.passwordChangedAt,
        lockedUser.sessionRevokedAt,
      );
      const claimed = await tx.authPasswordResetToken.updateMany({
        where: {
          id: matchedToken.id,
          mode: PasswordResetMode.reset_token,
          consumedAt: null,
          expiresAt: { gt: confirmedAt },
        },
        data: { consumedAt: confirmedAt },
      });

      if (claimed.count !== 1) {
        return null;
      }

      await tx.user.update({
        where: { id: matchedToken.userId },
        data: {
          passwordHash: hashPassword(dto.new_password),
          passwordChangedAt: confirmedAt,
          sessionRevokedAt: confirmedAt,
          forcePasswordChange: false,
        },
      });
      await tx.authRefreshToken.updateMany({
        where: {
          userId: matchedToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: confirmedAt,
          revokeReason: 'password_reset_confirmed',
        },
      });
      await tx.authPasswordResetToken.updateMany({
        where: {
          userId: matchedToken.userId,
          id: { not: matchedToken.id },
          consumedAt: null,
        },
        data: { consumedAt: confirmedAt },
      });
      return confirmedAt;
    });

    if (!resetAt) {
      throw new BadRequestException({
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'password reset token is invalid or expired',
      });
    }

    void this.securityAuditService.record({
      action: 'password_reset_confirmed',
      result: 'success',
      actorUserId: matchedToken.userId,
      targetUserId: matchedToken.userId,
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        reset: true,
        changed_at: resetAt.toISOString(),
      },
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async revokeRefreshTokensAfterReuse(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const lockedUser = await this.lockUser(tx, userId);
      if (!lockedUser) {
        return;
      }
      const revokedAt = this.nextSecurityTimestamp(lockedUser.sessionRevokedAt);
      await tx.user.update({
        where: { id: userId },
        data: { sessionRevokedAt: revokedAt },
      });
      await tx.authRefreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt,
          revokeReason: 'refresh_token_reuse_detected',
        },
      });
    });
    await this.recordRefreshReuse(userId);
  }

  private async recordRefreshReuse(userId: string) {
    await this.securityAuditService.record({
      action: 'refresh_token_reuse',
      result: 'blocked',
      actorUserId: userId,
      targetUserId: userId,
    });
  }

  private async lockUser(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: UserStatus;
        forcePasswordChange: boolean;
        passwordChangedAt: Date | null;
        sessionRevokedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        "id",
        "status",
        "force_password_change" AS "forcePasswordChange",
        "password_changed_at" AS "passwordChangedAt",
        "session_revoked_at" AS "sessionRevokedAt"
      FROM "users"
      WHERE "id" = ${userId}::uuid
      FOR UPDATE
    `);
    return rows[0] ?? null;
  }

  private nextSecurityTimestamp(...previous: Array<Date | null | undefined>) {
    const minimum = previous.reduce(
      (latest, value) => Math.max(latest, value?.getTime() ?? 0),
      0,
    );
    return new Date(Math.max(Date.now(), minimum + 1));
  }

  private sameTimestamp(left: Date | null, right: Date | null) {
    return (left?.getTime() ?? null) === (right?.getTime() ?? null);
  }
}
