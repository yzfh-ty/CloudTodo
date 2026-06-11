import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { SyncChangesQueryDto } from './dto/sync-changes-query.dto';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(user: AuthenticatedUser) {
    const now = new Date();
    const [
      currentUser,
      todoLists,
      tags,
      todoTags,
      todos,
      reminders,
      reminderEvents,
      notificationEndpoints,
      notificationDeliveries,
      devices,
    ] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: this.userSelect(),
      }),
      this.prisma.todoList.findMany({
        where: { userId: user.id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: this.todoListSelect(),
      }),
      this.prisma.tag.findMany({
        where: { userId: user.id },
        orderBy: { name: 'asc' },
        select: this.tagSelect(),
      }),
      this.prisma.todoTag.findMany({
        where: { todo: { userId: user.id } },
        orderBy: { createdAt: 'asc' },
        select: this.todoTagSelect(),
      }),
      this.prisma.todo.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        select: this.todoSelect(),
      }),
      this.prisma.reminder.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        select: this.reminderSelect(),
      }),
      this.prisma.reminderEvent.findMany({
        where: { userId: user.id },
        orderBy: { triggeredAt: 'desc' },
        take: 200,
        select: this.reminderEventSelect(),
      }),
      this.prisma.notificationEndpoint.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        select: this.notificationEndpointSelect(),
      }),
      this.prisma.notificationDelivery.findMany({
        where: { reminderEvent: { userId: user.id } },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: this.notificationDeliverySelect(),
      }),
      this.prisma.device.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        select: this.deviceSelect(),
      }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        cursor: now.toISOString(),
        user: currentUser,
        todo_lists: todoLists,
        tags,
        todo_tags: todoTags,
        todos,
        reminders,
        reminder_events: reminderEvents,
        notification_endpoints: notificationEndpoints,
        notification_deliveries: notificationDeliveries,
        devices,
      },
    };
  }

  async changes(user: AuthenticatedUser, query: SyncChangesQueryDto) {
    const cursor = query.cursor ? new Date(query.cursor) : new Date(0);
    if (Number.isNaN(cursor.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'cursor must be a valid ISO datetime',
      });
    }

    const now = new Date();
    const [
      currentUser,
      todoLists,
      tags,
      todos,
      reminders,
      reminderEvents,
      notificationEndpoints,
      notificationDeliveries,
      devices,
    ] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: this.userSelect(),
      }),
      this.prisma.todoList.findMany({
        where: { userId: user.id, updatedAt: { gt: cursor } },
        orderBy: { updatedAt: 'asc' },
        select: this.todoListSelect(),
      }),
      this.prisma.tag.findMany({
        where: { userId: user.id, updatedAt: { gt: cursor } },
        orderBy: { updatedAt: 'asc' },
        select: this.tagSelect(),
      }),
      this.prisma.todo.findMany({
        where: { userId: user.id, updatedAt: { gt: cursor } },
        orderBy: { updatedAt: 'asc' },
        select: this.todoSelect(),
      }),
      this.prisma.reminder.findMany({
        where: { userId: user.id, updatedAt: { gt: cursor } },
        orderBy: { updatedAt: 'asc' },
        select: this.reminderSelect(),
      }),
      this.prisma.reminderEvent.findMany({
        where: { userId: user.id, createdAt: { gt: cursor } },
        orderBy: { createdAt: 'asc' },
        select: this.reminderEventSelect(),
      }),
      this.prisma.notificationEndpoint.findMany({
        where: { userId: user.id, updatedAt: { gt: cursor } },
        orderBy: { updatedAt: 'asc' },
        select: this.notificationEndpointSelect(),
      }),
      this.prisma.notificationDelivery.findMany({
        where: {
          updatedAt: { gt: cursor },
          reminderEvent: { userId: user.id },
        },
        orderBy: { updatedAt: 'asc' },
        select: this.notificationDeliverySelect(),
      }),
      this.prisma.device.findMany({
        where: { userId: user.id, updatedAt: { gt: cursor } },
        orderBy: { updatedAt: 'asc' },
        select: this.deviceSelect(),
      }),
    ]);

    const changedTodoIds = todos.map((todo) => todo.id);
    const todoTags = changedTodoIds.length
      ? await this.prisma.todoTag.findMany({
          where: {
            todoId: { in: changedTodoIds },
            todo: { userId: user.id },
          },
          orderBy: { createdAt: 'asc' },
          select: this.todoTagSelect(),
        })
      : [];

    return {
      code: 'OK',
      message: 'success',
      data: {
        cursor: now.toISOString(),
        user: currentUser,
        todo_lists: todoLists,
        tags,
        todo_tags: todoTags,
        todos,
        reminders,
        reminder_events: reminderEvents,
        notification_endpoints: notificationEndpoints,
        notification_deliveries: notificationDeliveries,
        devices,
      },
    };
  }

  private userSelect() {
    return {
      id: true,
      email: true,
      username: true,
      nickname: true,
      role: true,
      status: true,
      timezone: true,
      avatarUrl: true,
      lastLoginAt: true,
      passwordChangedAt: true,
      forcePasswordChange: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.UserSelect;
  }

  private todoListSelect() {
    return {
      id: true,
      userId: true,
      name: true,
      color: true,
      isDefault: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.TodoListSelect;
  }

  private tagSelect() {
    return {
      id: true,
      userId: true,
      name: true,
      color: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.TagSelect;
  }

  private todoTagSelect() {
    return {
      todoId: true,
      tagId: true,
      createdAt: true,
    } satisfies Prisma.TodoTagSelect;
  }

  private todoSelect() {
    return {
      id: true,
      userId: true,
      listId: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueAt: true,
      isAllDay: true,
      sourcePlatform: true,
      completedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.TodoSelect;
  }

  private reminderSelect() {
    return {
      id: true,
      todoId: true,
      userId: true,
      channel: true,
      repeatType: true,
      repeatRule: true,
      remindAt: true,
      timezone: true,
      status: true,
      lastTriggeredAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.ReminderSelect;
  }

  private reminderEventSelect() {
    return {
      id: true,
      reminderId: true,
      todoId: true,
      userId: true,
      channel: true,
      scheduledFor: true,
      triggeredAt: true,
      dedupeKey: true,
      status: true,
      payload: true,
      createdAt: true,
    } satisfies Prisma.ReminderEventSelect;
  }

  private notificationEndpointSelect() {
    return {
      id: true,
      userId: true,
      type: true,
      name: true,
      targetUrl: true,
      payloadTemplate: true,
      isEnabled: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      lastResponseCode: true,
      lastResponseSummary: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.NotificationEndpointSelect;
  }

  private notificationDeliverySelect() {
    return {
      id: true,
      reminderEventId: true,
      endpointId: true,
      status: true,
      attemptCount: true,
      nextRetryAt: true,
      responseCode: true,
      responseBody: true,
      lastError: true,
      deliveredAt: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.NotificationDeliverySelect;
  }

  private deviceSelect() {
    return {
      id: true,
      userId: true,
      platform: true,
      deviceName: true,
      deviceIdentifier: true,
      appVersion: true,
      pushToken: true,
      lastActiveAt: true,
      lastIp: true,
      isOnline: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.DeviceSelect;
  }
}
