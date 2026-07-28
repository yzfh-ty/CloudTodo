import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AdminOperationAction,
  AdminOperationResult,
  PasswordResetMode,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { hashPassword, upgradedPasswordHash, verifyPassword } from '../../common/security/password.util';
import { hashResetToken } from '../../common/security/token-hash.util';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import { SecurityRequestContextService } from '../../common/security/security-request-context.service';
import {
  accountLookupWhere,
  assertUnambiguousUsername,
  emailConflictWhere,
  usernameConflictWhere,
} from '../../common/security/account-identifier.util';
import type { AuthenticatedAdmin } from './admin-session.service';
import { AdminMfaService } from './admin-mfa.service';
import {
  createAuditLogTx,
  generateSecret,
  generateTemporaryPassword,
  lockUser,
  nextSecurityTimestamp,
} from './admin-security.util';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminOperationLogQueryDto } from './dto/admin-operation-log-query.dto';
import { AdminSecurityAuditLogQueryDto } from './dto/admin-security-audit-log-query.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';
import {
  getAdminDashboardSummary,
  getAdminOperationLogs,
  getAdminSecurityAuditLogs,
  getAdminUserById,
  getAdminUserDevices,
  getAdminUsers,
  requireAdminUser,
  verifyAdminSecurityAuditChain,
} from './admin-query.functions';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly requestContext: SecurityRequestContextService,
    private readonly adminMfaService: AdminMfaService,
  ) {}

  async login(dto: AdminLoginDto) {
    const account = dto.account.trim();
    const admin = await this.prisma.user.findFirst({
      where: accountLookupWhere(account),
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        forcePasswordChange: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        sessionRevokedAt: true,
        passwordHash: true,
        totpEnabledAt: true,
        totpSecretEncrypted: true,
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

    if (!admin || admin.role !== UserRole.admin || admin.status !== UserStatus.active) {
      void this.securityAuditService.record({
        action: 'admin_login_failure',
        result: 'failure',
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid admin credentials',
      });
    }

    if (!(await verifyPassword(dto.password, admin.passwordHash))) {
      void this.securityAuditService.record({
        action: 'admin_login_failure',
        result: 'failure',
        targetUserId: admin.id,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid admin credentials',
      });
    }

    if (admin.forcePasswordChange) {
      const temporaryPassword = admin.receivedPasswordResetTokens[0];
      if (
        !temporaryPassword ||
        temporaryPassword.expiresAt <= new Date() ||
        temporaryPassword.temporaryPasswordHash !== admin.passwordHash
      ) {
        void this.securityAuditService.record({
          action: 'admin_login_failure',
          result: 'failure',
          targetUserId: admin.id,
          metadata: { reason: 'temporary_password_expired' },
        });
        throw new UnauthorizedException({
          code: 'TEMPORARY_PASSWORD_EXPIRED',
          message: 'temporary password is expired; request a new reset',
        });
      }
    }

    const upgradedHash = await upgradedPasswordHash(dto.password, admin.passwordHash, admin.forcePasswordChange);

    await this.adminMfaService.assertLoginMfa(admin, dto.totp_code);

    const loginAt = nextSecurityTimestamp(
      admin.passwordChangedAt,
      admin.sessionRevokedAt,
    );
    const loginClaim = await this.prisma.user.updateMany({
      where: {
        id: admin.id,
        role: UserRole.admin,
        status: UserStatus.active,
        passwordChangedAt: admin.passwordChangedAt,
        passwordHash: admin.passwordHash,
        sessionRevokedAt: admin.sessionRevokedAt,
        ...(admin.forcePasswordChange
          ? {
              receivedPasswordResetTokens: {
                some: {
                  mode: PasswordResetMode.temporary_password,
                  consumedAt: null,
                  expiresAt: { gt: loginAt },
                  temporaryPasswordHash: admin.passwordHash,
                },
              },
            }
          : {}),
      },
      data: {
        lastLoginAt: loginAt,
        ...(upgradedHash ? { passwordHash: upgradedHash } : {}),
      },
    });
    if (loginClaim.count !== 1) {
      void this.securityAuditService.record({
        action: 'admin_login_failure',
        result: 'failure',
        targetUserId: admin.id,
        metadata: { reason: 'credentials_changed_during_login' },
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'admin credentials changed; please try again',
      });
    }

    const updatedAdmin = {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      nickname: admin.nickname,
      role: admin.role,
      status: admin.status,
      forcePasswordChange: admin.forcePasswordChange,
      lastLoginAt: loginAt,
    };

    void this.securityAuditService.record({
      action: 'admin_login_success',
      result: 'success',
      actorUserId: updatedAdmin.id,
      targetUserId: updatedAdmin.id,
      metadata: { password_change_required: updatedAdmin.forcePasswordChange },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        admin: updatedAdmin,
      },
    };
  }

  async logout(admin: AuthenticatedAdmin) {
    await this.prisma.$transaction(async (tx) => {
      const lockedUser = await lockUser(tx, admin.id);
      if (!lockedUser) {
        return;
      }
      const revokedAt = nextSecurityTimestamp(lockedUser.sessionRevokedAt);
      await tx.user.update({
        where: { id: admin.id },
        data: { sessionRevokedAt: revokedAt },
      });
      await tx.authRefreshToken.updateMany({
        where: { userId: admin.id, revokedAt: null },
        data: { revokedAt, revokeReason: 'admin_logout' },
      });
    });
    void this.securityAuditService.record({
      action: 'admin_logout',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: admin.id,
    });

    return {
      code: 'OK',
      message: 'success',
      data: null,
    };
  }

  async changePassword(admin: AuthenticatedAdmin, dto: AdminChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'password confirmation does not match',
      });
    }

    const currentAdmin = await this.prisma.user.findUnique({
      where: { id: admin.id },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        passwordChangedAt: true,
        sessionRevokedAt: true,
      },
    });

    if (!currentAdmin) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'admin not found',
      });
    }

    if (!(await verifyPassword(dto.currentPassword, currentAdmin.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'current password is invalid',
      });
    }

    const nextPasswordHash = await hashPassword(dto.newPassword);
    const changedAt = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await lockUser(tx, admin.id);
      const securityChangedAt = nextSecurityTimestamp(
        lockedUser?.passwordChangedAt,
        lockedUser?.sessionRevokedAt,
      );
      const changed = await tx.user.updateMany({
        where: {
          id: admin.id,
          role: UserRole.admin,
          status: UserStatus.active,
          passwordHash: currentAdmin.passwordHash,
          passwordChangedAt: currentAdmin.passwordChangedAt,
          sessionRevokedAt: currentAdmin.sessionRevokedAt,
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
          userId: admin.id,
          revokedAt: null,
        },
        data: {
          revokedAt: securityChangedAt,
          revokeReason: 'admin_password_changed',
        },
      });
      await tx.authPasswordResetToken.updateMany({
        where: { userId: admin.id, consumedAt: null },
        data: { consumedAt: securityChangedAt },
      });

      await createAuditLogTx(tx, this.requestContext, {
        adminUserId: admin.id,
        targetUserId: admin.id,
        action: AdminOperationAction.change_admin_password,
        reason: 'change own password',
        result: AdminOperationResult.success,
        metadata: {
          changed_at: securityChangedAt.toISOString(),
        },
      });
      return securityChangedAt;
    });

    void this.securityAuditService.record({
      action: 'admin_password_change',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: admin.id,
      metadata: { forced: admin.forcePasswordChange },
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

  async logoutAllSessions(admin: AuthenticatedAdmin, reason?: string) {
    const appliedReason = reason?.trim() || 'manual logout all sessions';

    const revokedResult = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await lockUser(tx, admin.id);
      if (!lockedUser) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'admin not found',
        });
      }
      const revokedAt = nextSecurityTimestamp(lockedUser.sessionRevokedAt);
      await tx.user.update({
        where: { id: admin.id },
        data: { sessionRevokedAt: revokedAt },
      });
      const revoked = await tx.authRefreshToken.updateMany({
        where: { userId: admin.id, revokedAt: null },
        data: { revokedAt, revokeReason: 'admin_logout_all_sessions' },
      });

      await createAuditLogTx(tx, this.requestContext, {
        adminUserId: admin.id,
        targetUserId: admin.id,
        action: AdminOperationAction.logout_all_sessions,
        reason: appliedReason,
        result: AdminOperationResult.success,
        metadata: {
          revoked_refresh_tokens: revoked.count,
          revoked_at: revokedAt.toISOString(),
        },
      });

      return { ...revoked, revokedAt };
    });

    void this.securityAuditService.record({
      action: 'admin_logout_all_sessions',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: admin.id,
      metadata: { revoked_refresh_tokens: revokedResult.count },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        action: 'logout_all_sessions',
        reason: appliedReason,
        revoked_refresh_tokens: revokedResult.count,
        reauth_required: true,
      },
    };
  }

  async getDashboardSummary() {
    return getAdminDashboardSummary(this.prisma);
  }

  async getUsers(query: AdminUserListQueryDto) {
    return getAdminUsers(this.prisma, query);
  }

  async createUser(admin: AuthenticatedAdmin, dto: AdminCreateUserDto) {
    const username = dto.username.trim();
    assertUnambiguousUsername(username);
    const email = dto.email.trim().toLowerCase();
    const nickname = dto.nickname?.trim() || username;
    const timezone = dto.timezone?.trim() || 'Asia/Shanghai';
    const role = dto.role ?? UserRole.user;
    const status = dto.status ?? UserStatus.active;

    const [emailExists, usernameExists] = await this.prisma.$transaction([
      this.prisma.user.findFirst({
        where: emailConflictWhere(email),
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: usernameConflictWhere(username),
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

    const passwordHash = await hashPassword(dto.password);
    const createdAt = new Date();
    const temporaryToken = generateSecret(24);
    const temporaryTokenHash = hashResetToken(temporaryToken);
    const temporaryExpiresAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          nickname,
          timezone,
          role,
          status,
          forcePasswordChange: true,
          passwordChangedAt: createdAt,
          sessionRevokedAt: createdAt,
        },
        select: {
          id: true,
          username: true,
          email: true,
          nickname: true,
          role: true,
          status: true,
          timezone: true,
          forcePasswordChange: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await tx.authPasswordResetToken.create({
        data: {
          userId: createdUser.id,
          createdByUserId: admin.id,
          tokenHash: temporaryTokenHash,
          mode: PasswordResetMode.temporary_password,
          temporaryPasswordHash: passwordHash,
          reason: dto.reason,
          expiresAt: temporaryExpiresAt,
        },
      });
      await createAuditLogTx(tx, this.requestContext, {
        adminUserId: admin.id,
        targetUserId: createdUser.id,
        action: AdminOperationAction.create_user,
        reason: dto.reason,
        result: AdminOperationResult.success,
        metadata: {
          role,
          status,
          temporary_password_expires_at: temporaryExpiresAt.toISOString(),
        },
      });
      return createdUser;
    });

    void this.securityAuditService.record({
      action: 'admin_user_created',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: user.id,
      metadata: { role: user.role, status: user.status },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        created: true,
        user,
        temporary_password_expires_at: temporaryExpiresAt.toISOString(),
      },
    };
  }

  async getUserById(id: string) {
    return getAdminUserById(this.prisma, id);
  }

  async updateUser(admin: AuthenticatedAdmin, id: string, dto: AdminUpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        timezone: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'user not found',
      });
    }

    const nextUsername = dto.username?.trim();
    if (nextUsername) assertUnambiguousUsername(nextUsername);
    const nextEmail = dto.email?.trim().toLowerCase();
    const nextNickname = dto.nickname?.trim();
    const nextTimezone = dto.timezone?.trim();

    const data: Prisma.UserUpdateInput = {};

    if (nextUsername && nextUsername !== user.username) {
      const existingUsernameUser = await this.prisma.user.findFirst({
        where: usernameConflictWhere(nextUsername, id),
        select: { id: true },
      });

      if (existingUsernameUser) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'username is already in use',
        });
      }

      data.username = nextUsername;
    }

    if (nextEmail && nextEmail !== user.email) {
      const existingEmailUser = await this.prisma.user.findFirst({
        where: emailConflictWhere(nextEmail, id),
        select: { id: true },
      });

      if (existingEmailUser) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'email is already in use',
        });
      }

      data.email = nextEmail;
    }

    if (nextNickname && nextNickname !== user.nickname) {
      data.nickname = nextNickname;
    }

    if (nextTimezone && nextTimezone !== user.timezone) {
      data.timezone = nextTimezone;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'no user fields to update',
      });
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          username: true,
          email: true,
          nickname: true,
          role: true,
          status: true,
          timezone: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await createAuditLogTx(tx, this.requestContext, {
        adminUserId: admin.id,
        targetUserId: id,
        action: AdminOperationAction.update_user_profile,
        reason: dto.reason,
        result: AdminOperationResult.success,
          metadata: {
            before: {
              username: user.username,
              email: user.email,
              nickname: user.nickname,
              timezone: user.timezone,
            },
            after: {
              username: result.username,
              email: result.email,
              nickname: result.nickname,
              timezone: result.timezone,
          },
        },
      });

      return result;
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        updated: true,
        user: updatedUser,
      },
    };
  }

  async disableUser(admin: AuthenticatedAdmin, id: string, reason: string) {
    const appliedReason = reason.trim();
    if (!appliedReason) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'reason is required',
      });
    }

    if (admin.id === id) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'admin cannot disable self',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await lockUser(tx, id);
      if (!lockedUser) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'user not found',
        });
      }
      if (lockedUser.status === UserStatus.disabled) {
        throw new BadRequestException({
          code: 'USER_ALREADY_DISABLED',
          message: 'user is already disabled',
        });
      }
      const revokedAt = nextSecurityTimestamp(lockedUser.sessionRevokedAt);
      const updatedUser = await tx.user.update({
        where: { id },
        data: {
          status: UserStatus.disabled,
          sessionRevokedAt: revokedAt,
        },
        select: {
          id: true,
          status: true,
        },
      });

      const revokedTokens = await tx.authRefreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt,
          revokeReason: 'user_disabled_by_admin',
        },
      });

      await createAuditLogTx(tx, this.requestContext, {
        adminUserId: admin.id,
        targetUserId: id,
        action: AdminOperationAction.disable_user,
        reason: appliedReason,
        result: AdminOperationResult.success,
        metadata: {
          before_status: lockedUser.status,
          after_status: updatedUser.status,
          revoked_refresh_tokens: revokedTokens.count,
        },
      });

      return { updatedUser, revokedTokens };
    });

    void this.securityAuditService.record({
      action: 'admin_user_disabled',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: id,
      metadata: { revoked_refresh_tokens: result.revokedTokens.count },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        user_id: result.updatedUser.id,
        status: result.updatedUser.status,
        revoked_sessions: result.revokedTokens.count,
      },
    };
  }

  async enableUser(admin: AuthenticatedAdmin, id: string, reason?: string) {
    const user = await requireAdminUser(this.prisma, id);
    if (user.status === UserStatus.active) {
      throw new BadRequestException({
        code: 'USER_ALREADY_ACTIVE',
        message: 'user is already active',
      });
    }

    const appliedReason = reason?.trim() || 'manual enable';
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          status: UserStatus.active,
        },
        select: {
          id: true,
          status: true,
        },
      });

      await createAuditLogTx(tx, this.requestContext, {
        adminUserId: admin.id,
        targetUserId: id,
        action: AdminOperationAction.enable_user,
        reason: appliedReason,
        result: AdminOperationResult.success,
        metadata: {
          before_status: user.status,
          after_status: result.status,
        },
      });

      return result;
    });

    void this.securityAuditService.record({
      action: 'admin_user_enabled',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: id,
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        user_id: updatedUser.id,
        status: updatedUser.status,
      },
    };
  }

  async resetPassword(
    admin: AuthenticatedAdmin,
    id: string,
    dto: AdminResetPasswordDto,
  ) {
    const trackingToken = generateSecret(24);
    const trackingTokenHash = hashResetToken(trackingToken);

    if (dto.mode === PasswordResetMode.temporary_password) {
      const temporaryPassword = generateTemporaryPassword();
      const temporaryPasswordHash = await hashPassword(temporaryPassword);

      const resetResult = await this.prisma.$transaction(async (tx) => {
        const lockedUser = await lockUser(tx, id);
        if (!lockedUser) {
          throw new NotFoundException({
            code: 'USER_NOT_FOUND',
            message: 'user not found',
          });
        }
        const now = nextSecurityTimestamp(
          lockedUser.passwordChangedAt,
          lockedUser.sessionRevokedAt,
        );
        const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        await tx.user.update({
          where: { id },
          data: {
            passwordHash: temporaryPasswordHash,
            forcePasswordChange: true,
            passwordChangedAt: now,
            sessionRevokedAt: now,
          },
        });

        await tx.authRefreshToken.updateMany({
          where: {
            userId: id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokeReason: 'password_reset_by_admin',
          },
        });

        await tx.authPasswordResetToken.updateMany({
          where: { userId: id, consumedAt: null },
          data: { consumedAt: now },
        });

        await tx.authPasswordResetToken.create({
          data: {
            userId: id,
            createdByUserId: admin.id,
            tokenHash: trackingTokenHash,
            mode: PasswordResetMode.temporary_password,
            temporaryPasswordHash,
            reason: dto.reason,
            expiresAt,
          },
        });

        await createAuditLogTx(tx, this.requestContext, {
          adminUserId: admin.id,
          targetUserId: id,
          action: AdminOperationAction.reset_user_password,
          reason: dto.reason,
          result: AdminOperationResult.success,
          metadata: {
            mode: dto.mode,
            target_status: lockedUser.status,
            expires_at: expiresAt.toISOString(),
          },
        });
        return { expiresAt };
      });

      void this.securityAuditService.record({
        action: 'admin_password_reset_issued',
        result: 'success',
        actorUserId: admin.id,
        targetUserId: id,
        metadata: { mode: dto.mode },
      });

      return {
        code: 'OK',
        message: 'success',
        data: {
          mode: dto.mode,
          temporary_password: temporaryPassword,
          expires_at: resetResult.expiresAt.toISOString(),
          force_password_change: true,
        },
      };
    }

    const resetToken = generateSecret(32);
    const resetTokenHash = hashResetToken(resetToken);

    const resetResult = await this.prisma.$transaction(async (tx) => {
      const lockedUser = await lockUser(tx, id);
      if (!lockedUser) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'user not found',
        });
      }
      const now = nextSecurityTimestamp(
        lockedUser.passwordChangedAt,
        lockedUser.sessionRevokedAt,
      );
      const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      await tx.user.update({
        where: { id },
        data: {
          forcePasswordChange: true,
          sessionRevokedAt: now,
        },
      });
      await tx.authRefreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: 'password_reset_requested_by_admin',
        },
      });

      await tx.authPasswordResetToken.updateMany({
        where: { userId: id, consumedAt: null },
        data: { consumedAt: now },
      });

      await tx.authPasswordResetToken.create({
        data: {
          userId: id,
          createdByUserId: admin.id,
          tokenHash: resetTokenHash,
          mode: PasswordResetMode.reset_token,
          reason: dto.reason,
          expiresAt,
        },
      });

      await createAuditLogTx(tx, this.requestContext, {
        adminUserId: admin.id,
        targetUserId: id,
        action: AdminOperationAction.reset_user_password,
        reason: dto.reason,
        result: AdminOperationResult.success,
        metadata: {
          mode: dto.mode,
          target_status: lockedUser.status,
          expires_at: expiresAt.toISOString(),
        },
      });
      return { expiresAt };
    });

    void this.securityAuditService.record({
      action: 'admin_password_reset_issued',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: id,
      metadata: { mode: dto.mode },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        mode: dto.mode,
        reset_token: resetToken,
        expires_at: resetResult.expiresAt.toISOString(),
      },
    };
  }

  async getUserDevices(id: string) {
    return getAdminUserDevices(this.prisma, id);
  }
  async getOperationLogs(query: AdminOperationLogQueryDto) {
    return getAdminOperationLogs(this.prisma, query);
  }
  async getSecurityAuditLogs(query: AdminSecurityAuditLogQueryDto) {
    return getAdminSecurityAuditLogs(this.prisma, query);
  }

  async verifySecurityAuditChain() {
    return verifyAdminSecurityAuditChain(this.securityAuditService);
  }
}
