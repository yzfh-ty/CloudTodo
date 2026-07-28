import { ConfigService } from '@nestjs/config';
import {
  NotificationDeliveryStatus,
  NotificationEndpointType,
  PrismaClient,
  ReminderChannel,
  ReminderStatus,
  TodoPriority,
  TodoStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { OutboundHttpService } from '../src/common/security/outbound-http.service';
import type { AuthenticatedUser } from '../src/modules/auth/user-session.service';
import { SchedulerService } from '../src/modules/scheduler/scheduler.service';
import { SyncService } from '../src/modules/sync/sync.service';

const databaseUrl = process.env.SYNC_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

interface SchedulerTestApi {
  processPendingDeliveries(): Promise<void>;
  deliverWebhook(deliveryId: string, claimUpdatedAt: Date): Promise<void>;
}

describeWithPostgres('sync watermark PostgreSQL concurrency', () => {
  let writer: PrismaClient;
  let reader: PrismaClient;

  beforeAll(async () => {
    writer = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    reader = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await Promise.all([writer.$connect(), reader.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([writer.$disconnect(), reader.$disconnect()]);
  });

  it('waits for an in-flight write and includes it before advancing the cursor', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const testUser = await writer.user.create({
      data: {
        email: `sync-watermark-${suffix}@example.com`,
        username: `sync_watermark_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Sync Watermark Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });
    const todo = await writer.todo.create({
      data: {
        userId: testUser.id,
        title: 'before concurrent update',
        status: TodoStatus.pending,
        priority: TodoPriority.medium,
      },
    });

    let releaseWriter!: () => void;
    const canCommit = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    let markWriterStarted!: () => void;
    const writerStarted = new Promise<void>((resolve) => {
      markWriterStarted = resolve;
    });
    const writerTransaction = writer.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "todos"
        SET "title" = 'committed concurrent update',
            "updated_at" = TIMESTAMPTZ '2999-01-01 00:00:00+00'
        WHERE "id" = CAST(${todo.id} AS UUID)
      `;
      markWriterStarted();
      await canCommit;
    });

    try {
      await writerStarted;
      const service = new SyncService(reader as unknown as PrismaService);
      let syncSettled = false;
      const sync = service
        .changes(
          { id: testUser.id } as AuthenticatedUser,
          { cursor: todo.updatedAt.toISOString(), page_size: 50 },
        )
        .finally(() => {
          syncSettled = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(syncSettled).toBe(false);

      releaseWriter();
      await writerTransaction;
      const result = await sync;
      expect(result.data.todos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: todo.id,
            title: 'committed concurrent update',
          }),
        ]),
      );
      expect(new Date(result.data.cursor).getTime()).toBeGreaterThanOrEqual(
        result.data.todos[0].updatedAt.getTime(),
      );
    } finally {
      releaseWriter();
      await writerTransaction.catch(() => undefined);
      await writer.user.delete({ where: { id: testUser.id } });
    }
  }, 15_000);

  it('paginates rows sharing one millisecond without duplicates or omissions', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const testUser = await writer.user.create({
      data: {
        email: `sync-keyset-${suffix}@example.com`,
        username: `sync_keyset_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Sync Keyset Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });
    const sharedUpdatedAt = new Date(Date.now() - 1_000);
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort();

    try {
      await writer.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "todos" DISABLE TRIGGER "todos_sync_watermark"',
        );
        await tx.todo.createMany({
          data: ids.map((id, index) => ({
            id,
            userId: testUser.id,
            title: `same millisecond ${index}`,
            status: TodoStatus.pending,
            priority: TodoPriority.medium,
            createdAt: sharedUpdatedAt,
            updatedAt: sharedUpdatedAt,
          })),
        });
        await tx.$executeRawUnsafe(
          'ALTER TABLE "todos" ENABLE TRIGGER "todos_sync_watermark"',
        );
      });

      const service = new SyncService(reader as unknown as PrismaService);
      let cursor = new Date(sharedUpdatedAt.getTime() - 1).toISOString();
      const returnedIds: string[] = [];
      do {
        const result = await service.changes(
          { id: testUser.id } as AuthenticatedUser,
          { cursor, page_size: 1 },
        );
        returnedIds.push(...result.data.todos.map((todo) => todo.id));
        cursor = result.data.cursor;
        if (!result.data.has_more) {
          break;
        }
      } while (returnedIds.length <= ids.length);

      expect(returnedIds).toEqual(ids);
    } finally {
      await writer.user.delete({ where: { id: testUser.id } });
    }
  }, 15_000);

  it('returns a millisecond-exact database lease token from an atomic claim', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const testUser = await writer.user.create({
      data: {
        email: `delivery-lease-${suffix}@example.com`,
        username: `delivery_lease_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Delivery Lease Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });

    try {
      const todo = await writer.todo.create({
        data: {
          userId: testUser.id,
          title: 'lease test',
          status: TodoStatus.pending,
          priority: TodoPriority.medium,
        },
      });
      const reminder = await writer.reminder.create({
        data: {
          userId: testUser.id,
          todoId: todo.id,
          channel: ReminderChannel.webhook,
          remindAt: new Date(),
          repeatLocalTime: '00:00:00.000',
          status: ReminderStatus.pending,
        },
      });
      const event = await writer.reminderEvent.create({
        data: {
          userId: testUser.id,
          todoId: todo.id,
          reminderId: reminder.id,
          channel: ReminderChannel.webhook,
          scheduledFor: new Date(),
          triggeredAt: new Date(),
          dedupeKey: `lease-${suffix}`,
        },
      });
      const endpoint = await writer.notificationEndpoint.create({
        data: {
          userId: testUser.id,
          type: NotificationEndpointType.webhook,
          name: 'Lease endpoint',
          targetUrl: 'https://hooks.example.com/lease',
        },
      });
      const delivery = await writer.notificationDelivery.create({
        data: {
          reminderEventId: event.id,
          endpointId: endpoint.id,
        },
      });
      const service = new SchedulerService(
        new ConfigService({ DELIVERY_PROCESSING_LEASE_MS: '60000' }),
        writer as unknown as PrismaService,
        {} as OutboundHttpService,
      );
      const scheduler = service as unknown as SchedulerTestApi;
      const deliverWebhook = jest
        .spyOn(scheduler, 'deliverWebhook')
        .mockResolvedValue(undefined);

      await scheduler.processPendingDeliveries();

      expect(deliverWebhook).toHaveBeenCalledTimes(1);
      const claimUpdatedAt = deliverWebhook.mock.calls[0][1];
      const owned = await writer.notificationDelivery.findFirst({
        where: {
          id: delivery.id,
          status: NotificationDeliveryStatus.processing,
          updatedAt: claimUpdatedAt,
        },
      });
      const [precision] = await writer.$queryRaw<Array<{ remainder: number }>>`
        SELECT (
          EXTRACT(MICROSECONDS FROM "updated_at")::BIGINT % 1000
        )::INTEGER AS "remainder"
        FROM "notification_deliveries"
        WHERE "id" = CAST(${delivery.id} AS UUID)
      `;
      expect(owned).not.toBeNull();
      expect(owned?.updatedAt).toEqual(claimUpdatedAt);
      expect(precision?.remainder).toBe(0);
    } finally {
      await writer.user.delete({ where: { id: testUser.id } });
    }
  }, 15_000);
});
