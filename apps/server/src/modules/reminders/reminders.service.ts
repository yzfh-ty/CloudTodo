import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async createReminder(user: AuthenticatedUser, todoId: string, dto: CreateReminderDto) {
    await this.ensureTodoBelongsToUser(todoId, user.id);

    const reminder = await this.prisma.reminder.create({
      data: {
        todoId,
        userId: user.id,
        channel: dto.channel,
        repeatType: dto.repeat_type ?? 'none',
        repeatRule: dto.repeat_rule as Prisma.InputJsonValue | undefined,
        remindAt: new Date(dto.remind_at),
        timezone: dto.timezone?.trim() || user.timezone,
        status: ReminderStatus.pending,
      },
      select: this.reminderSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: reminder,
    };
  }

  async updateReminder(user: AuthenticatedUser, id: string, dto: UpdateReminderDto) {
    await this.findReminderOrThrow(user.id, id);
    const data: Record<string, unknown> = {};

    if (dto.channel !== undefined) data.channel = dto.channel;
    if (dto.remind_at !== undefined) data.remindAt = new Date(dto.remind_at);
    if (dto.repeat_type !== undefined) data.repeatType = dto.repeat_type;
    if (dto.repeat_rule !== undefined) data.repeatRule = dto.repeat_rule;
    if (dto.timezone !== undefined) data.timezone = dto.timezone?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'no reminder fields to update',
      });
    }

    const reminder = await this.prisma.reminder.update({
      where: { id },
      data,
      select: this.reminderSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: reminder,
    };
  }

  async deleteReminder(user: AuthenticatedUser, id: string) {
    await this.findReminderOrThrow(user.id, id);

    const reminder = await this.prisma.reminder.update({
      where: { id },
      data: {
        status: ReminderStatus.cancelled,
        deletedAt: new Date(),
      },
      select: this.reminderSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: reminder,
    };
  }

  async getUpcomingReminders(user: AuthenticatedUser) {
    const items = await this.prisma.reminder.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        status: ReminderStatus.pending,
      },
      orderBy: {
        remindAt: 'asc',
      },
      take: 20,
      select: this.reminderSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        items,
      },
    };
  }

  private async ensureTodoBelongsToUser(todoId: string, userId: string) {
    const todo = await this.prisma.todo.findFirst({
      where: {
        id: todoId,
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!todo) {
      throw new NotFoundException({
        code: 'TODO_NOT_FOUND',
        message: 'todo not found',
      });
    }
  }

  private async findReminderOrThrow(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      select: this.reminderSelect(),
    });

    if (!reminder) {
      throw new NotFoundException({
        code: 'REMINDER_NOT_FOUND',
        message: 'reminder not found',
      });
    }

    return reminder;
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
    };
  }
}
