import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReminderEventStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { ReminderEventQueryDto } from './dto/reminder-event-query.dto';
import {
  parseReminderEventCursor,
  serializeReminderEventCursor,
} from './reminder-event-cursor.util';

@Injectable()
export class ReminderEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReminderEvents(user: AuthenticatedUser, query: ReminderEventQueryDto) {
    const pageSize = query.page_size ?? 50;
    return this.prisma.$transaction(async (tx) => {
      const stableUpper = await this.acquireStableUpper(tx, user.id);
      const window = parseReminderEventCursor(
        query.cursor,
        pageSize,
        query.status,
        query.channel,
        stableUpper,
      );
      const positionWhere: Prisma.ReminderEventWhereInput = window.position
        ? {
            OR: [
              { createdAt: { gt: window.position.at } },
              { createdAt: window.position.at, id: { gt: window.position.id } },
            ],
          }
        : { createdAt: { gt: window.base } };
      const fetched = await tx.reminderEvent.findMany({
        where: {
          userId: user.id,
          ...(query.status ? { status: query.status } : {}),
          ...(query.channel ? { channel: query.channel } : {}),
          AND: [positionWhere, { createdAt: { lte: window.upper } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: pageSize + 1,
        select: this.reminderEventSelect(),
      });
      const hasMore = fetched.length > pageSize;
      const items = fetched.slice(0, pageSize);
      const lastItem = items.at(-1);
      const cursor =
        hasMore && lastItem
          ? serializeReminderEventCursor(window, {
              at: lastItem.createdAt,
              id: lastItem.id,
            })
          : window.upper.toISOString();

      return {
        code: 'OK',
        message: 'success',
        data: {
          items,
          cursor,
          page: window.page,
          page_size: pageSize,
          has_more: hasMore,
        },
      };
    });
  }

  async getReminderEvent(user: AuthenticatedUser, id: string) {
    const event = await this.findReminderEventOrThrow(user.id, id);
    return {
      code: 'OK',
      message: 'success',
      data: event,
    };
  }

  async ackReminderEvent(user: AuthenticatedUser, id: string) {
    await this.findReminderEventOrThrow(user.id, id);
    const event = await this.prisma.reminderEvent.update({
      where: { id },
      data: { status: ReminderEventStatus.processed },
      select: this.reminderEventSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: event,
    };
  }

  private async findReminderEventOrThrow(userId: string, id: string) {
    const event = await this.prisma.reminderEvent.findFirst({
      where: {
        id,
        userId,
      },
      select: this.reminderEventSelect(),
    });

    if (!event) {
      throw new NotFoundException({
        code: 'REMINDER_EVENT_NOT_FOUND',
        message: 'reminder event not found',
      });
    }

    return event;
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
      payload: true,
      createdAt: true,
    } satisfies Prisma.ReminderEventSelect;
  }

  private async acquireStableUpper(tx: Prisma.TransactionClient, userId: string) {
    const [snapshot] = await tx.$queryRaw<Array<{ stableUpper: Date }>>(Prisma.sql`
      SELECT "cloudtodo_acquire_sync_snapshot"(CAST(${userId} AS UUID))
        AS "stableUpper"
    `);
    if (!(snapshot?.stableUpper instanceof Date)) {
      throw new Error('failed to acquire reminder event cursor snapshot');
    }
    return snapshot.stableUpper;
  }
}
