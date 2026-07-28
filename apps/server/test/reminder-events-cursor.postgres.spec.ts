import {
  PrismaClient,
  ReminderChannel,
  ReminderEventStatus,
  ReminderStatus,
  TodoPriority,
  TodoStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { AuthenticatedUser } from '../src/modules/auth/user-session.service';
import { ReminderEventsService } from '../src/modules/reminder-events/reminder-events.service';

const databaseUrl = process.env.SYNC_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('reminder event PostgreSQL cursor pagination', () => {
  let prisma: PrismaClient;
  let reader: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    reader = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await Promise.all([prisma.$connect(), reader.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), reader.$disconnect()]);
  });

  it('reads every queued event across pages without advancing past unread rows', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `event-cursor-${suffix}@example.com`,
        username: `event_cursor_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Event Cursor Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });

    try {
      const todo = await prisma.todo.create({
        data: {
          userId: user.id,
          title: 'cursor pagination',
          status: TodoStatus.pending,
          priority: TodoPriority.medium,
        },
      });
      const reminder = await prisma.reminder.create({
        data: {
          userId: user.id,
          todoId: todo.id,
          channel: ReminderChannel.android_local,
          remindAt: new Date(),
          repeatLocalTime: '00:00:00.000',
          status: ReminderStatus.triggered,
        },
      });
      await prisma.reminderEvent.createMany({
        data: Array.from({ length: 3 }, (_, index) => ({
          userId: user.id,
          todoId: todo.id,
          reminderId: reminder.id,
          channel: ReminderChannel.android_local,
          scheduledFor: new Date(),
          triggeredAt: new Date(),
          dedupeKey: `event-cursor-${suffix}-${index}`,
          status: ReminderEventStatus.pending,
        })),
      });
      const sharedCreatedAt = new Date(Date.now() - 1_000);
      await prisma.$executeRaw`
        UPDATE "reminder_events"
        SET "created_at" = ${sharedCreatedAt}
        WHERE "reminder_id" = CAST(${reminder.id} AS UUID)
      `;

      const service = new ReminderEventsService(prisma as unknown as PrismaService);
      const authenticatedUser = { id: user.id } as AuthenticatedUser;
      const returnedIds: string[] = [];
      let cursor: string | undefined = new Date(0).toISOString();
      const hasMoreValues: boolean[] = [];

      for (let page = 0; page < 4; page += 1) {
        const result = await service.getReminderEvents(authenticatedUser, {
          cursor,
          page_size: 1,
        });
        const pageData = result.data as typeof result.data & { has_more?: boolean };
        returnedIds.push(...pageData.items.map((item) => item.id));
        hasMoreValues.push(pageData.has_more === true);
        cursor = pageData.cursor;
        if (pageData.has_more !== true) {
          break;
        }
      }

      expect(returnedIds).toHaveLength(3);
      expect(new Set(returnedIds).size).toBe(3);
      expect(hasMoreValues).toEqual([true, true, false]);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 15_000);

  it('waits for an older in-flight insert before advancing the cursor', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `event-barrier-${suffix}@example.com`,
        username: `event_barrier_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Event Barrier Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });

    let releaseWriter!: () => void;
    const writerCanCommit = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    let markWriterStarted!: () => void;
    const writerStarted = new Promise<void>((resolve) => {
      markWriterStarted = resolve;
    });
    let writerTransaction: Promise<{ id: string; createdAt: Date }> | undefined;

    try {
      const todo = await prisma.todo.create({
        data: {
          userId: user.id,
          title: 'cursor write barrier',
          status: TodoStatus.pending,
          priority: TodoPriority.medium,
        },
      });
      const reminder = await prisma.reminder.create({
        data: {
          userId: user.id,
          todoId: todo.id,
          channel: ReminderChannel.android_local,
          remindAt: new Date(),
          repeatLocalTime: '00:00:00.000',
          status: ReminderStatus.triggered,
        },
      });
      writerTransaction = prisma.$transaction(async (tx) => {
        const event = await tx.reminderEvent.create({
          data: {
            userId: user.id,
            todoId: todo.id,
            reminderId: reminder.id,
            channel: ReminderChannel.android_local,
            scheduledFor: new Date(),
            triggeredAt: new Date(),
            dedupeKey: `event-barrier-${suffix}`,
            status: ReminderEventStatus.pending,
          },
        });
        markWriterStarted();
        await writerCanCommit;
        return event;
      });

      await writerStarted;
      const service = new ReminderEventsService(reader as unknown as PrismaService);
      let readSettled = false;
      const read = service
        .getReminderEvents({ id: user.id } as AuthenticatedUser, {
          cursor: new Date(0).toISOString(),
          page_size: 10,
        })
        .finally(() => {
          readSettled = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(readSettled).toBe(false);
      releaseWriter();
      const [event, result] = await Promise.all([writerTransaction, read]);
      expect(result.data.items.map((item) => item.id)).toContain(event.id);
      expect(new Date(result.data.cursor).getTime()).toBeGreaterThanOrEqual(
        event.createdAt.getTime(),
      );
    } finally {
      releaseWriter();
      await writerTransaction?.catch(() => undefined);
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 15_000);
});
