import { ConfigService } from '@nestjs/config';
import {
  PrismaClient,
  ReminderChannel,
  ReminderRepeatType,
  ReminderStatus,
  TodoPriority,
  TodoStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { OutboundHttpService } from '../src/common/security/outbound-http.service';
import { SchedulerService } from '../src/modules/scheduler/scheduler.service';

const databaseUrl = process.env.SYNC_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

interface SchedulerTestApi {
  processDueReminders(): Promise<void>;
}

describeWithPostgres('reminder scheduler PostgreSQL concurrency', () => {
  let firstClient: PrismaClient;
  let secondClient: PrismaClient;

  beforeAll(async () => {
    firstClient = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    secondClient = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
  });

  it('does not let a stale scan from another instance stop a repeating reminder', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await firstClient.user.create({
      data: {
        email: `scheduler-race-${suffix}@example.com`,
        username: `scheduler_race_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Scheduler Race Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });

    try {
      const todo = await firstClient.todo.create({
        data: {
          userId: user.id,
          title: 'repeat across scheduler instances',
          status: TodoStatus.pending,
          priority: TodoPriority.medium,
        },
      });
      const scheduledFor = new Date(Date.now() - 60_000);
      const reminder = await firstClient.reminder.create({
        data: {
          userId: user.id,
          todoId: todo.id,
          channel: ReminderChannel.android_local,
          repeatType: ReminderRepeatType.daily,
          remindAt: scheduledFor,
          repeatLocalTime: '00:00:00.000',
          status: ReminderStatus.pending,
        },
        include: {
          todo: {
            select: {
              id: true,
              title: true,
              description: true,
              dueAt: true,
              priority: true,
              status: true,
            },
          },
        },
      });

      let releaseStaleScan!: () => void;
      const staleScanCanContinue = new Promise<void>((resolve) => {
        releaseStaleScan = resolve;
      });
      let markStaleScanReady!: () => void;
      const staleScanReady = new Promise<void>((resolve) => {
        markStaleScanReady = resolve;
      });
      const delayedPrisma = {
        reminder: {
          findMany: jest.fn(async () => {
            markStaleScanReady();
            await staleScanCanContinue;
            return [reminder];
          }),
        },
        $transaction: secondClient.$transaction.bind(secondClient),
      };
      const firstPrisma = {
        reminder: { findMany: jest.fn().mockResolvedValue([reminder]) },
        $transaction: firstClient.$transaction.bind(firstClient),
      };
      const firstScheduler = new SchedulerService(
        new ConfigService(),
        firstPrisma as unknown as PrismaService,
        {} as OutboundHttpService,
      ) as unknown as SchedulerTestApi;
      const delayedScheduler = new SchedulerService(
        new ConfigService(),
        delayedPrisma as unknown as PrismaService,
        {} as OutboundHttpService,
      ) as unknown as SchedulerTestApi;

      const delayedRun = delayedScheduler.processDueReminders();
      await staleScanReady;
      await firstScheduler.processDueReminders();
      releaseStaleScan();
      await delayedRun;

      const [storedReminder, eventCount] = await Promise.all([
        firstClient.reminder.findUniqueOrThrow({ where: { id: reminder.id } }),
        firstClient.reminderEvent.count({ where: { reminderId: reminder.id } }),
      ]);
      expect(storedReminder.status).toBe(ReminderStatus.pending);
      expect(storedReminder.remindAt.getTime()).toBeGreaterThan(Date.now());
      expect(eventCount).toBe(1);
    } finally {
      await firstClient.user.delete({ where: { id: user.id } });
    }
  }, 15_000);
});
