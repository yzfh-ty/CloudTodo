import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { SyncBootstrapQueryDto } from './dto/sync-bootstrap-query.dto';
import { SyncChangesQueryDto } from './dto/sync-changes-query.dto';
import {
  DEFAULT_SYNC_PAGE_SIZE,
  MAX_SYNC_CURSOR_PAGES,
  parseSyncCursor,
  serializeSyncCursor,
  type SyncCursorDone,
  type SyncCursorPosition,
  type SyncCursorPositions,
} from './sync-cursor.util';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(user: AuthenticatedUser, query: SyncBootstrapQueryDto) {
    const requestedSnapshotAt = query.snapshot_at
      ? new Date(query.snapshot_at)
      : undefined;
    if (requestedSnapshotAt && Number.isNaN(requestedSnapshotAt.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'snapshot_at must be a valid past or present datetime',
      });
    }
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? DEFAULT_SYNC_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const take = pageSize + 1;
    return this.prisma.$transaction(async (tx) => {
      const stableUpper = await this.acquireStableUpper(tx, user.id);
      if (requestedSnapshotAt && requestedSnapshotAt > stableUpper) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'snapshot_at must be a valid past or present datetime',
        });
      }
      const snapshotAt = requestedSnapshotAt ?? stableUpper;
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
      ] = await Promise.all([
        tx.user.findUnique({
          where: { id: user.id },
          select: this.userSelect(),
        }),
        tx.todoList.findMany({
          where: { userId: user.id, createdAt: { lte: snapshotAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.todoListSelect(),
        }),
        tx.tag.findMany({
          where: { userId: user.id, createdAt: { lte: snapshotAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.tagSelect(),
        }),
        tx.todoTag.findMany({
          where: {
            todo: { userId: user.id },
            createdAt: { lte: snapshotAt },
          },
          orderBy: [{ createdAt: 'asc' }, { todoId: 'asc' }, { tagId: 'asc' }],
          skip,
          take,
          select: this.todoTagSelect(),
        }),
        tx.todo.findMany({
          where: { userId: user.id, createdAt: { lte: snapshotAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.todoSelect(),
        }),
        tx.reminder.findMany({
          where: { userId: user.id, createdAt: { lte: snapshotAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.reminderSelect(),
        }),
        tx.reminderEvent.findMany({
          where: { userId: user.id, createdAt: { lte: snapshotAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.reminderEventSelect(),
        }),
        tx.notificationEndpoint.findMany({
          where: { userId: user.id, createdAt: { lte: snapshotAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.notificationEndpointSelect(),
        }),
        tx.notificationDelivery.findMany({
          where: {
            reminderEvent: { userId: user.id },
            createdAt: { lte: snapshotAt },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.notificationDeliverySelect(),
        }),
        tx.device.findMany({
          where: { userId: user.id, createdAt: { lte: snapshotAt } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.deviceSelect(),
        }),
      ]);

      const collections = [
        todoLists,
        tags,
        todoTags,
        todos,
        reminders,
        reminderEvents,
        notificationEndpoints,
        notificationDeliveries,
        devices,
      ];
      const hasMore = collections.some((items) => items.length > pageSize);

      return {
        code: 'OK',
        message: 'success',
        data: {
          cursor: snapshotAt.toISOString(),
          user: currentUser,
          page,
          page_size: pageSize,
          has_more: hasMore,
          todo_lists: todoLists.slice(0, pageSize),
          tags: tags.slice(0, pageSize),
          todo_tags: todoTags.slice(0, pageSize),
          todos: todos.slice(0, pageSize),
          reminders: reminders.slice(0, pageSize),
          reminder_events: reminderEvents.slice(0, pageSize),
          notification_endpoints: notificationEndpoints.slice(0, pageSize),
          notification_deliveries: notificationDeliveries.slice(0, pageSize),
          devices: devices.slice(0, pageSize),
        },
      };
    });
  }

  async changes(user: AuthenticatedUser, query: SyncChangesQueryDto) {
    const pageSize = query.page_size ?? DEFAULT_SYNC_PAGE_SIZE;
    return this.prisma.$transaction(async (tx) => {
      const stableUpper = await this.acquireStableUpper(tx, user.id);
      const window = parseSyncCursor(query.cursor, pageSize, stableUpper);
      const take = pageSize + 1;
      const skip = window.mode === 'offset' ? (window.page - 1) * pageSize : 0;
      const todoListWhere = this.userCollectionWhere<Prisma.TodoListWhereInput>(
        user.id,
        window.positions.todo_lists,
        window.done.todo_lists,
        window.base,
        window.upper,
        'updatedAt',
      );
      const tagWhere = this.userCollectionWhere<Prisma.TagWhereInput>(
        user.id,
        window.positions.tags,
        window.done.tags,
        window.base,
        window.upper,
        'updatedAt',
      );
      const todoWhere = this.userCollectionWhere<Prisma.TodoWhereInput>(
        user.id,
        window.positions.todos,
        window.done.todos,
        window.base,
        window.upper,
        'updatedAt',
      );
      const reminderWhere = this.userCollectionWhere<Prisma.ReminderWhereInput>(
        user.id,
        window.positions.reminders,
        window.done.reminders,
        window.base,
        window.upper,
        'updatedAt',
      );
      const reminderEventWhere = this.userCollectionWhere<
        Prisma.ReminderEventWhereInput
      >(
        user.id,
        window.positions.reminder_events,
        window.done.reminder_events,
        window.base,
        window.upper,
        'updatedAt',
      );
      const endpointWhere = this.userCollectionWhere<
        Prisma.NotificationEndpointWhereInput
      >(
        user.id,
        window.positions.notification_endpoints,
        window.done.notification_endpoints,
        window.base,
        window.upper,
        'updatedAt',
      );
      const deliveryWhere = this.deliveryWhere(
        user.id,
        window.positions.notification_deliveries,
        window.done.notification_deliveries,
        window.base,
        window.upper,
      );
      const deviceWhere = this.userCollectionWhere<Prisma.DeviceWhereInput>(
        user.id,
        window.positions.devices,
        window.done.devices,
        window.base,
        window.upper,
        'updatedAt',
      );
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
      ] = await Promise.all([
        tx.user.findUnique({
          where: { id: user.id },
          select: this.userSelect(),
        }),
        tx.todoList.findMany({
          where: todoListWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.todoListSelect(),
        }),
        tx.tag.findMany({
          where: tagWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.tagSelect(),
        }),
        tx.todo.findMany({
          where: todoWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.todoSelect(),
        }),
        tx.reminder.findMany({
          where: reminderWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.reminderSelect(),
        }),
        tx.reminderEvent.findMany({
          where: reminderEventWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.reminderEventSelect(),
        }),
        tx.notificationEndpoint.findMany({
          where: endpointWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.notificationEndpointSelect(),
        }),
        tx.notificationDelivery.findMany({
          where: deliveryWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.notificationDeliverySelect(),
        }),
        tx.device.findMany({
          where: deviceWhere,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: this.deviceSelect(),
        }),
      ]);

      const hasMore = [
        todoLists,
        tags,
        todos,
        reminders,
        reminderEvents,
        notificationEndpoints,
        notificationDeliveries,
        devices,
      ].some((items) => items.length > pageSize);

      if (hasMore && window.page >= MAX_SYNC_CURSOR_PAGES) {
        throw new BadRequestException({
          code: 'SYNC_PAGE_LIMIT_EXCEEDED',
          message: 'sync window is too large; start a new bootstrap sync',
        });
      }
      const returnedTodoLists = todoLists.slice(0, pageSize);
      const returnedTags = tags.slice(0, pageSize);
      const returnedTodos = todos.slice(0, pageSize);
      const returnedReminders = reminders.slice(0, pageSize);
      const returnedReminderEvents = reminderEvents.slice(0, pageSize);
      const returnedEndpoints = notificationEndpoints.slice(0, pageSize);
      const returnedDeliveries = notificationDeliveries.slice(0, pageSize);
      const returnedDevices = devices.slice(0, pageSize);
      const nextPositions: SyncCursorPositions = { ...window.positions };
      const nextDone: SyncCursorDone = { ...window.done };
      if (window.mode === 'keyset') {
        this.setCursorState(
          nextPositions,
          nextDone,
          'todo_lists',
          todoLists,
          pageSize,
          'updatedAt',
          'id',
        );
        this.setCursorState(
          nextPositions,
          nextDone,
          'tags',
          tags,
          pageSize,
          'updatedAt',
          'id',
        );
        this.setCursorState(
          nextPositions,
          nextDone,
          'todos',
          todos,
          pageSize,
          'updatedAt',
          'id',
        );
        this.setCursorState(
          nextPositions,
          nextDone,
          'reminders',
          reminders,
          pageSize,
          'updatedAt',
          'id',
        );
        this.setCursorState(
          nextPositions,
          nextDone,
          'reminder_events',
          reminderEvents,
          pageSize,
          'updatedAt',
          'id',
        );
        this.setCursorState(
          nextPositions,
          nextDone,
          'notification_endpoints',
          notificationEndpoints,
          pageSize,
          'updatedAt',
          'id',
        );
        this.setCursorState(
          nextPositions,
          nextDone,
          'notification_deliveries',
          notificationDeliveries,
          pageSize,
          'updatedAt',
          'id',
        );
        this.setCursorState(
          nextPositions,
          nextDone,
          'devices',
          devices,
          pageSize,
          'updatedAt',
          'id',
        );
      }
      const nextCursor = hasMore
        ? serializeSyncCursor(window, window.page + 1, nextPositions, nextDone)
        : window.upper.toISOString();
      // Relation writes touch the parent Todo, so each Todo page carries its
      // complete current tag set instead of maintaining a separate relation cursor.
      const todoTags = returnedTodos.length
        ? await tx.todoTag.findMany({
            where: {
              todoId: { in: returnedTodos.map((todo) => todo.id) },
              todo: { userId: user.id },
            },
            orderBy: [{ todoId: 'asc' }, { tagId: 'asc' }],
            select: this.todoTagSelect(),
          })
        : [];

      return {
        code: 'OK',
        message: 'success',
        data: {
          cursor: nextCursor,
          page: window.page,
          page_size: pageSize,
          has_more: hasMore,
          user: currentUser,
          todo_lists: returnedTodoLists,
          tags: returnedTags,
          todo_tags: todoTags,
          todos: returnedTodos,
          reminders: returnedReminders,
          reminder_events: returnedReminderEvents,
          notification_endpoints: returnedEndpoints,
          notification_deliveries: returnedDeliveries,
          devices: returnedDevices,
        },
      };
    });
  }

  private async acquireStableUpper(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<Date> {
    const [snapshot] = await tx.$queryRaw<Array<{ stableUpper: Date }>>(
      Prisma.sql`
        SELECT "cloudtodo_acquire_sync_snapshot"(CAST(${userId} AS UUID))
          AS "stableUpper"
      `,
    );
    if (
      !(snapshot?.stableUpper instanceof Date) ||
      Number.isNaN(snapshot.stableUpper.getTime())
    ) {
      throw new Error('database returned an invalid sync snapshot timestamp');
    }
    return snapshot.stableUpper;
  }

  private userCollectionWhere<TWhere>(
    userId: string,
    position: SyncCursorPosition | undefined,
    done: boolean | undefined,
    base: Date,
    upper: Date,
    timestampField: 'updatedAt' | 'createdAt',
  ): TWhere {
    return {
      userId,
      ...this.changeKeysetFilter(position, done, base, upper, timestampField),
    } as TWhere;
  }

  private deliveryWhere(
    userId: string,
    position: SyncCursorPosition | undefined,
    done: boolean | undefined,
    base: Date,
    upper: Date,
  ): Prisma.NotificationDeliveryWhereInput {
    return {
      reminderEvent: { userId },
      ...(this.changeKeysetFilter(
        position,
        done,
        base,
        upper,
        'updatedAt',
      ) as Prisma.NotificationDeliveryWhereInput),
    };
  }

  private changeKeysetFilter(
    position: SyncCursorPosition | undefined,
    done: boolean | undefined,
    base: Date,
    upper: Date,
    timestampField: 'updatedAt' | 'createdAt',
  ): Prisma.TodoListWhereInput {
    if (done) {
      return { id: { in: [] } };
    }
    if (!position) {
      return timestampField === 'updatedAt'
        ? { updatedAt: { gt: base, lte: upper } }
        : { createdAt: { gt: base, lte: upper } };
    }
    return timestampField === 'updatedAt'
      ? {
          OR: [
            { updatedAt: { gt: position.at, lte: upper } },
            {
              updatedAt: { equals: position.at },
              id: { gt: position.id },
            },
          ],
        }
      : {
          OR: [
            { createdAt: { gt: position.at, lte: upper } },
            {
              createdAt: { equals: position.at },
              id: { gt: position.id },
            },
          ],
        };
  }

  private setCursorState(
    positions: SyncCursorPositions,
    done: SyncCursorDone,
    collection: keyof SyncCursorPositions,
    items: readonly unknown[],
    pageSize: number,
    timestampField: 'updatedAt' | 'createdAt',
    idField: 'id' | 'todoId',
  ) {
    done[collection] = items.length <= pageSize;
    const returnedCount = Math.min(items.length, pageSize);
    if (returnedCount === 0) {
      return;
    }
    const item = items[returnedCount - 1] as Record<string, unknown>;
    const at = item[timestampField];
    const id = item[idField];
    if (!(at instanceof Date) || typeof id !== 'string') {
      throw new Error(`sync collection ${collection} has no keyset fields`);
    }
    positions[collection] = {
      at,
      id,
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
      status: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.ReminderEventSelect;
  }

  private notificationEndpointSelect() {
    return {
      id: true,
      userId: true,
      type: true,
      name: true,
      payloadTemplate: true,
      isEnabled: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      lastResponseCode: true,
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
      appVersion: true,
      lastActiveAt: true,
      isOnline: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.DeviceSelect;
  }
}
