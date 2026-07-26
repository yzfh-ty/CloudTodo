import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AdminOperationAction,
  AdminOperationResult,
  Prisma,
  ReminderStatus,
  UserStatus,
} from '@prisma/client';
import type { PrismaService } from '../../common/database/prisma.service';
import { AdminOperationLogQueryDto } from './dto/admin-operation-log-query.dto';
import { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';

export async function getAdminDashboardSummary(prisma: PrismaService) {
  const now = new Date();
  const todayStartUtc = getUtcDayStart(now);
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
  ] = await prisma.$transaction([
    prisma.user.count({
      where: nonDeletedUsersWhere,
    }),
    prisma.user.count({
      where: {
        status: UserStatus.active,
      },
    }),
    prisma.user.count({
      where: {
        status: UserStatus.disabled,
      },
    }),
    prisma.user.count({
      where: {
        ...nonDeletedUsersWhere,
        createdAt: {
          gte: todayStartUtc,
          lt: nextDayStartUtc,
        },
      },
    }),
    prisma.user.count({
      where: {
        ...nonDeletedUsersWhere,
        lastLoginAt: {
          gte: recentLoginStart,
        },
      },
    }),
    prisma.adminOperationLog.count({
      where: {
        action: AdminOperationAction.reset_user_password,
        result: AdminOperationResult.success,
        createdAt: {
          gte: todayStartUtc,
          lt: nextDayStartUtc,
        },
      },
    }),
    prisma.adminOperationLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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


const MAX_PAGE = 500;
const MAX_PAGE_SIZE = 100;

/**
 * DTO validation already bounds page inputs; this clamp keeps the invariant
 * even for direct service callers or a bootstrap without the global pipe.
 */
function clampPagination(page: number | undefined, pageSize: number | undefined) {
  const safePage = Math.min(Math.max(Math.trunc(page ?? 1) || 1, 1), MAX_PAGE);
  const safePageSize = Math.min(Math.max(Math.trunc(pageSize ?? 20) || 20, 1), MAX_PAGE_SIZE);
  return { page: safePage, pageSize: safePageSize, skip: (safePage - 1) * safePageSize };
}

export async function getAdminUsers(prisma: PrismaService, query: AdminUserListQueryDto) {
  const { page, pageSize, skip } = clampPagination(query.page, query.page_size);
  const keyword = query.keyword?.trim();
  const where: Prisma.UserWhereInput = {};

  assertValidDateRange(query.created_start, query.created_end, 'created');
  assertValidDateRange(query.last_login_start, query.last_login_end, 'last_login');

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

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    prisma.user.count({ where }),
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

export async function getAdminUserById(prisma: PrismaService, id: string) {
  const user = await prisma.user.findUnique({
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
  ] = await prisma.$transaction([
    prisma.todo.count({
      where: { userId: id, deletedAt: null },
    }),
    prisma.todo.count({
      where: { userId: id, status: 'pending', deletedAt: null },
    }),
    prisma.todo.count({
      where: { userId: id, status: 'completed', deletedAt: null },
    }),
    prisma.todo.count({
      where: { userId: id, status: 'archived', deletedAt: null },
    }),
    prisma.reminder.count({
      where: { userId: id, status: ReminderStatus.pending, deletedAt: null },
    }),
    prisma.reminder.count({
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

export async function getAdminUserDevices(prisma: PrismaService, id: string) {
  await requireAdminUser(prisma, id);
  const items = await prisma.device.findMany({
    where: {
      userId: id,
      deletedAt: null,
    },
    orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
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

export async function getAdminOperationLogs(prisma: PrismaService, query: AdminOperationLogQueryDto) {
  const { page, pageSize, skip } = clampPagination(query.page, query.page_size);
  const where: Prisma.AdminOperationLogWhereInput = {};

  if (query.start && query.end && new Date(query.start) > new Date(query.end)) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'start must be earlier than or equal to end',
    });
  }

  if (query.admin_user_id) {
    where.adminUserId = query.admin_user_id;
  }

  if (query.target_user_id) {
    where.targetUserId = query.target_user_id;
  }

  if (query.action) {
    where.action = query.action;
  }

  if (query.result) {
    where.result = query.result;
  }

  if (query.start || query.end) {
    where.createdAt = {
      ...(query.start ? { gte: new Date(query.start) } : {}),
      ...(query.end ? { lte: new Date(query.end) } : {}),
    };
  }

  const [items, total] = await prisma.$transaction([
    prisma.adminOperationLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.adminOperationLog.count({ where }),
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

export async function requireAdminUser(prisma: PrismaService, id: string) {
  const user = await prisma.user.findUnique({
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

function getUtcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function assertValidDateRange(start: string | undefined, end: string | undefined, name: string) {
  if (start && end && new Date(start) > new Date(end)) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `${name}_start must be earlier than or equal to ${name}_end`,
    });
  }
}
