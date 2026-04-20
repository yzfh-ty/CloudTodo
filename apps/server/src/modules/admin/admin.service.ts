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
  ReminderStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { hashPassword, verifyPassword } from '../../common/security/password.util';
import type { AuthenticatedAdmin } from './admin-session.service';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: AdminLoginDto) {
    const account = dto.account.trim();
    const admin = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: account }, { username: account }],
      },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        lastLoginAt: true,
        passwordHash: true,
      },
    });

    if (!admin || admin.role !== UserRole.admin || admin.status !== UserStatus.active) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid admin credentials',
      });
    }

    if (!verifyPassword(dto.password, admin.passwordHash)) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid admin credentials',
      });
    }

    const updatedAdmin = await this.prisma.user.update({
      where: { id: admin.id },
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
        lastLoginAt: true,
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        admin: updatedAdmin,
      },
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
      },
    });

    if (!currentAdmin) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'admin not found',
      });
    }

    if (!verifyPassword(dto.currentPassword, currentAdmin.passwordHash)) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'current password is invalid',
      });
    }

    const changedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: admin.id },
        data: {
          passwordHash: hashPassword(dto.newPassword),
          passwordChangedAt: changedAt,
          forcePasswordChange: false,
        },
      });

      await tx.authRefreshToken.updateMany({
        where: {
          userId: admin.id,
          revokedAt: null,
        },
        data: {
          revokedAt: changedAt,
          revokeReason: 'admin_password_changed',
        },
      });

      await this.createAuditLogTx(tx, {
        adminUserId: admin.id,
        targetUserId: admin.id,
        action: AdminOperationAction.change_admin_password,
        reason: 'change own password',
        result: AdminOperationResult.success,
        metadata: {
          changed_at: changedAt.toISOString(),
        },
      });
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
    const revokedAt = new Date();

    const revokedResult = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.authRefreshToken.updateMany({
        where: {
          userId: admin.id,
          revokedAt: null,
        },
        data: {
          revokedAt,
          revokeReason: 'admin_logout_all_sessions',
        },
      });

      await this.createAuditLogTx(tx, {
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

      return revoked;
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
    const now = new Date();
    const todayStartUtc = this.getUtcDayStart(now);
    const nextDayStartUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);
    const recentLoginStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const nonDeletedUsersWhere: Prisma.UserWhereInput = {
      status: {
        not: UserStatus.deleted,
      },
    };

    const [
      totalUsers,
      activeUsers,
      disabledUsers,
      newUsersToday,
      recentLoginUsers,
      passwordResetCountToday,
      recentAdminOperations,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: nonDeletedUsersWhere,
      }),
      this.prisma.user.count({
        where: {
          status: UserStatus.active,
        },
      }),
      this.prisma.user.count({
        where: {
          status: UserStatus.disabled,
        },
      }),
      this.prisma.user.count({
        where: {
          ...nonDeletedUsersWhere,
          createdAt: {
            gte: todayStartUtc,
            lt: nextDayStartUtc,
          },
        },
      }),
      this.prisma.user.count({
        where: {
          ...nonDeletedUsersWhere,
          lastLoginAt: {
            gte: recentLoginStart,
          },
        },
      }),
      this.prisma.adminOperationLog.count({
        where: {
          action: AdminOperationAction.reset_user_password,
          result: AdminOperationResult.success,
          createdAt: {
            gte: todayStartUtc,
            lt: nextDayStartUtc,
          },
        },
      }),
      this.prisma.adminOperationLog.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
        select: {
          id: true,
          action: true,
          result: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        totalUsers,
        activeUsers,
        disabledUsers,
        newUsersToday,
        recentLoginUsers,
        passwordResetCountToday,
        recentAdminOperations: recentAdminOperations.map((item) => ({
          id: item.id,
          action: item.action,
          result: item.result,
          created_at: item.createdAt,
        })),
      },
    };
  }

  async getUsers(query: AdminUserListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword?.trim();
    const where: Prisma.UserWhereInput = {};

    if (keyword) {
      where.OR = [
        { username: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
        { nickname: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.created_start || query.created_end) {
      where.createdAt = {
        ...(query.created_start ? { gte: new Date(query.created_start) } : {}),
        ...(query.created_end ? { lte: new Date(query.created_end) } : {}),
      };
    }

    if (query.last_login_start || query.last_login_end) {
      where.lastLoginAt = {
        ...(query.last_login_start ? { gte: new Date(query.last_login_start) } : {}),
        ...(query.last_login_end ? { lte: new Date(query.last_login_end) } : {}),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
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
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        items,
        page,
        page_size: pageSize,
        total,
        has_more: skip + items.length < total,
      },
    };
  }

  async createUser(admin: AuthenticatedAdmin, dto: AdminCreateUserDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    const nickname = dto.nickname?.trim() || username;
    const timezone = dto.timezone?.trim() || 'Asia/Shanghai';
    const role = dto.role ?? UserRole.user;
    const status = dto.status ?? UserStatus.active;

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
        username,
        email,
        passwordHash: hashPassword(dto.password),
        nickname,
        timezone,
        role,
        status,
      },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        role: true,
        status: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        created: true,
        user,
      },
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'user not found',
      });
    }

    const [
      totalTodos,
      pendingTodos,
      completedTodos,
      archivedTodos,
      pendingReminders,
      failedReminders,
    ] = await this.prisma.$transaction([
      this.prisma.todo.count({
        where: { userId: id, deletedAt: null },
      }),
      this.prisma.todo.count({
        where: { userId: id, status: 'pending', deletedAt: null },
      }),
      this.prisma.todo.count({
        where: { userId: id, status: 'completed', deletedAt: null },
      }),
      this.prisma.todo.count({
        where: { userId: id, status: 'archived', deletedAt: null },
      }),
      this.prisma.reminder.count({
        where: { userId: id, status: ReminderStatus.pending, deletedAt: null },
      }),
      this.prisma.reminder.count({
        where: { userId: id, status: ReminderStatus.failed, deletedAt: null },
      }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        ...user,
        todo_summary: {
          total: totalTodos,
          pending: pendingTodos,
          completed: completedTodos,
          archived: archivedTodos,
        },
        reminder_summary: {
          pending: pendingReminders,
          failed: failedReminders,
        },
      },
    };
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
    const nextEmail = dto.email?.trim();
    const nextNickname = dto.nickname?.trim();
    const nextTimezone = dto.timezone?.trim();

    const data: Prisma.UserUpdateInput = {};

    if (nextUsername && nextUsername !== user.username) {
      const existingUsernameUser = await this.prisma.user.findFirst({
        where: {
          username: nextUsername,
          NOT: { id },
        },
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
        where: {
          email: nextEmail,
          NOT: { id },
        },
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

      await this.createAuditLogTx(tx, {
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

    const user = await this.requireUser(id);
    if (user.status === UserStatus.disabled) {
      throw new BadRequestException({
        code: 'USER_ALREADY_DISABLED',
        message: 'user is already disabled',
      });
    }

    const revokedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data: {
          status: UserStatus.disabled,
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

      await this.createAuditLogTx(tx, {
        adminUserId: admin.id,
        targetUserId: id,
        action: AdminOperationAction.disable_user,
        reason: appliedReason,
        result: AdminOperationResult.success,
        metadata: {
          before_status: user.status,
          after_status: updatedUser.status,
          revoked_refresh_tokens: revokedTokens.count,
        },
      });

      return { updatedUser, revokedTokens };
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
    const user = await this.requireUser(id);
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

      await this.createAuditLogTx(tx, {
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
    const user = await this.requireUser(id);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const trackingToken = this.generateSecret(24);
    const trackingTokenHash = hashPassword(trackingToken);

    if (dto.mode === PasswordResetMode.temporary_password) {
      const temporaryPassword = this.generateTemporaryPassword();
      const temporaryPasswordHash = hashPassword(temporaryPassword);

      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            passwordHash: temporaryPasswordHash,
            forcePasswordChange: true,
            passwordChangedAt: now,
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

        await this.createAuditLogTx(tx, {
          adminUserId: admin.id,
          targetUserId: id,
          action: AdminOperationAction.reset_user_password,
          reason: dto.reason,
          result: AdminOperationResult.success,
          metadata: {
            mode: dto.mode,
            target_status: user.status,
            expires_at: expiresAt.toISOString(),
          },
        });
      });

      return {
        code: 'OK',
        message: 'success',
        data: {
          mode: dto.mode,
          temporary_password: temporaryPassword,
          expires_at: expiresAt.toISOString(),
          force_password_change: true,
        },
      };
    }

    const resetToken = this.generateSecret(32);
    const resetTokenHash = hashPassword(resetToken);

    await this.prisma.$transaction(async (tx) => {
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

      await this.createAuditLogTx(tx, {
        adminUserId: admin.id,
        targetUserId: id,
        action: AdminOperationAction.reset_user_password,
        reason: dto.reason,
        result: AdminOperationResult.success,
        metadata: {
          mode: dto.mode,
          target_status: user.status,
          expires_at: expiresAt.toISOString(),
        },
      });
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        mode: dto.mode,
        reset_token: resetToken,
        expires_at: expiresAt.toISOString(),
      },
    };
  }

  async getUserDevices(id: string) {
    await this.requireUser(id);
    const items = await this.prisma.device.findMany({
      where: {
        userId: id,
        deletedAt: null,
      },
      orderBy: {
        lastActiveAt: 'desc',
      },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        appVersion: true,
        isOnline: true,
        pushToken: true,
        lastActiveAt: true,
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        user_id: id,
        items: items.map((item) => ({
          id: item.id,
          platform: item.platform,
          device_name: item.deviceName,
          app_version: item.appVersion,
          is_online: item.isOnline,
          push_token_exists: Boolean(item.pushToken),
          last_active_at: item.lastActiveAt,
        })),
      },
    };
  }

  async getOperationLogs(query: Record<string, string | number | undefined>) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.page_size ?? 20);
    const skip = (page - 1) * pageSize;
    const where: Prisma.AdminOperationLogWhereInput = {};

    if (typeof query.admin_user_id === 'string') {
      where.adminUserId = query.admin_user_id;
    }

    if (typeof query.target_user_id === 'string') {
      where.targetUserId = query.target_user_id;
    }

    if (typeof query.action === 'string') {
      where.action = query.action as AdminOperationAction;
    }

    if (typeof query.result === 'string') {
      where.result = query.result as AdminOperationResult;
    }

    if (typeof query.start === 'string' || typeof query.end === 'string') {
      where.createdAt = {
        ...(typeof query.start === 'string' ? { gte: new Date(query.start) } : {}),
        ...(typeof query.end === 'string' ? { lte: new Date(query.end) } : {}),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminOperationLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.adminOperationLog.count({ where }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        items,
        page,
        page_size: pageSize,
        total,
        has_more: skip + items.length < total,
      },
    };
  }

  placeholder(action: string) {
    return {
      code: 'NOT_IMPLEMENTED',
      message: `${action} is scaffolded but not implemented yet`,
      data: null,
    };
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'user not found',
      });
    }

    return user;
  }

  private async createAuditLogTx(
    tx: Prisma.TransactionClient,
    input: {
      adminUserId: string;
      targetUserId?: string;
      action: AdminOperationAction;
      reason: string;
      result: AdminOperationResult;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    await tx.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId,
        targetUserId: input.targetUserId,
        action: input.action,
        reason: input.reason,
        result: input.result,
        metadata: input.metadata,
      },
    });
  }

  private generateTemporaryPassword(): string {
    return `Temp#${randomBytes(6).toString('hex')}`;
  }

  private generateSecret(byteLength: number): string {
    return randomBytes(byteLength).toString('base64url');
  }

  private getUtcDayStart(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}
