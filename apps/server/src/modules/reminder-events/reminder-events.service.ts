import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReminderEventStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { ReminderEventQueryDto } from './dto/reminder-event-query.dto';

@Injectable()
export class ReminderEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReminderEvents(user: AuthenticatedUser, query: ReminderEventQueryDto) {
    const pageSize = query.page_size ?? 50;
    const cursor = query.cursor ? new Date(query.cursor) : null;
    if (cursor && Number.isNaN(cursor.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'cursor must be a valid ISO datetime',
      });
    }

    const items = await this.prisma.reminderEvent.findMany({
      where: {
        userId: user.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(cursor ? { createdAt: { gt: cursor } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(pageSize, 1), 200),
      select: this.reminderEventSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        items,
        cursor: new Date().toISOString(),
      },
    };
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
}
