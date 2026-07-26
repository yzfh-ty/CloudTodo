import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationDeliveryStatus,
  NotificationEndpointType,
  ReminderChannel,
  ReminderStatus,
  TodoPriority,
  TodoStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { OutboundHttpService } from '../src/common/security/outbound-http.service';
import type { RateLimitService } from '../src/common/security/rate-limit.service';
import type { AuthenticatedUser } from '../src/modules/auth/user-session.service';
import { NotificationEndpointsService } from '../src/modules/notification-endpoints/notification-endpoints.service';
import { SchedulerService } from '../src/modules/scheduler/scheduler.service';

interface SchedulerTestApi {
  processPendingDeliveries(): Promise<void>;
  deliverWebhook(deliveryId: string, claimUpdatedAt: Date): Promise<void>;
}

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'user@example.com',
  username: 'user',
  nickname: 'User',
  role: UserRole.user,
  status: UserStatus.active,
  timezone: 'UTC',
  forcePasswordChange: false,
} satisfies AuthenticatedUser;

function endpointRecord(targetUrl = 'https://old.example.com/hooks/secret') {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    userId: user.id,
    type: NotificationEndpointType.webhook,
    name: 'Webhook',
    targetUrl,
    secret: null,
    payloadTemplate: null,
    isEnabled: true,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastResponseCode: null,
    lastResponseSummary: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  };
}

describe('webhook delivery processing lease', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('finds and atomically reclaims processing deliveries whose lease expired', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const databaseClaimedAt = new Date('2026-01-01T12:00:00.007Z');
    const leaseCutoff = new Date('2026-01-01T11:59:00.000Z');
    jest.useFakeTimers({ now });
    const findMany = jest.fn().mockResolvedValue([{ id: 'delivery-1' }]);
    const updateManyAndReturn = jest.fn().mockResolvedValue([
      { id: 'delivery-1', updatedAt: databaseClaimedAt },
    ]);
    const prisma = {
      notificationDelivery: { findMany, updateManyAndReturn },
    };
    const service = new SchedulerService(
      new ConfigService({
        DELIVERY_PROCESSING_LEASE_MS: '60000',
        WEBHOOK_REQUEST_TIMEOUT_MS: '5000',
      }),
      prisma as unknown as PrismaService,
      {} as OutboundHttpService,
    );
    const scheduler = service as unknown as SchedulerTestApi;
    const deliverWebhook = jest
      .spyOn(scheduler, 'deliverWebhook')
      .mockResolvedValue(undefined);
    const claimableWhere = {
      OR: [
        {
          status: {
            in: [NotificationDeliveryStatus.pending, NotificationDeliveryStatus.failed],
          },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        {
          status: NotificationDeliveryStatus.processing,
          updatedAt: { lte: leaseCutoff },
        },
      ],
    };

    await scheduler.processPendingDeliveries();

    expect(findMany).toHaveBeenCalledWith({
      where: claimableWhere,
      take: 20,
      orderBy: { createdAt: 'asc' },
      include: { endpoint: true, reminderEvent: true },
    });
    expect(updateManyAndReturn).toHaveBeenCalledWith({
      where: { id: 'delivery-1', ...claimableWhere },
      data: {
        status: NotificationDeliveryStatus.processing,
        updatedAt: now,
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });
    expect(deliverWebhook).toHaveBeenCalledWith('delivery-1', databaseClaimedAt);
  });

  it('skips a delivery when another worker wins the atomic claim', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    jest.useFakeTimers({ now });
    const prisma = {
      notificationDelivery: {
        findMany: jest.fn().mockResolvedValue([{ id: 'delivery-1' }]),
        updateManyAndReturn: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new SchedulerService(
      new ConfigService({ DELIVERY_PROCESSING_LEASE_MS: '60000' }),
      prisma as unknown as PrismaService,
      {} as OutboundHttpService,
    );
    const scheduler = service as unknown as SchedulerTestApi;
    const deliverWebhook = jest
      .spyOn(scheduler, 'deliverWebhook')
      .mockResolvedValue(undefined);

    await scheduler.processPendingDeliveries();

    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it('does not let a previous lease owner commit after the delivery was reclaimed', async () => {
    const claimUpdatedAt = new Date('2026-01-01T12:00:00.000Z');
    const transition = jest.fn().mockResolvedValue({ count: 0 });
    const updateEndpoint = jest.fn();
    const updateReminderEvent = jest.fn();
    const tx = {
      notificationDelivery: { updateMany: transition },
      notificationEndpoint: { update: updateEndpoint },
      reminderEvent: { update: updateReminderEvent },
    };
    const delivery = {
      id: 'delivery-1',
      reminderEventId: 'event-1',
      endpointId: 'endpoint-1',
      status: NotificationDeliveryStatus.processing,
      attemptCount: 0,
      updatedAt: claimUpdatedAt,
      endpoint: {
        id: 'endpoint-1',
        userId: user.id,
        name: 'Webhook',
        targetUrl: 'https://hooks.example.com/events',
        secret: null,
        payloadTemplate: null,
        isEnabled: true,
        deletedAt: null,
      },
      reminderEvent: {
        id: 'event-1',
        userId: user.id,
        channel: ReminderChannel.webhook,
        scheduledFor: new Date('2026-01-01T11:59:00.000Z'),
        triggeredAt: new Date('2026-01-01T11:59:00.000Z'),
        payload: {},
        user: {
          id: user.id,
          status: UserStatus.active,
          timezone: 'UTC',
        },
        todo: {
          id: 'todo-1',
          userId: user.id,
          title: 'Todo',
          description: null,
          status: TodoStatus.pending,
          priority: TodoPriority.medium,
          dueAt: null,
          deletedAt: null,
        },
        reminder: {
          id: 'reminder-1',
          userId: user.id,
          todoId: 'todo-1',
          status: ReminderStatus.pending,
          deletedAt: null,
        },
      },
    };
    const prisma = {
      notificationDelivery: {
        findUnique: jest.fn().mockResolvedValue(delivery),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const outboundHttpService = {
      postJson: jest.fn().mockResolvedValue({ status: 204, ok: true, body: '' }),
    };
    const service = new SchedulerService(
      new ConfigService({ DELIVERY_MAX_ATTEMPTS: '3' }),
      prisma as unknown as PrismaService,
      outboundHttpService as unknown as OutboundHttpService,
    );

    await (service as unknown as SchedulerTestApi).deliverWebhook(
      delivery.id,
      claimUpdatedAt,
    );

    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: delivery.id,
          status: NotificationDeliveryStatus.processing,
          updatedAt: claimUpdatedAt,
        },
      }),
    );
    expect(updateEndpoint).not.toHaveBeenCalled();
    expect(updateReminderEvent).not.toHaveBeenCalled();
  });
});

function createEndpointUpdateHarness(
  otherTargets: string[],
  config: Record<string, string>,
) {
  const update = jest.fn().mockResolvedValue(endpointRecord('https://new.example.com/hook'));
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: user.id }]),
    notificationEndpoint: {
      findMany: jest
        .fn()
        .mockResolvedValue(otherTargets.map((targetUrl) => ({ targetUrl }))),
      update,
    },
  };
  const prisma = {
    notificationEndpoint: {
      findFirst: jest.fn().mockResolvedValue(endpointRecord()),
      update: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const outboundHttpService = {
    validateUrl: jest.fn().mockResolvedValue({
      url: new URL('https://new.example.com/hook'),
      hostname: 'new.example.com',
      addresses: ['203.0.113.10'],
    }),
  };
  const service = new NotificationEndpointsService(
    prisma as unknown as PrismaService,
    outboundHttpService as unknown as OutboundHttpService,
    undefined,
    new ConfigService(config),
  );
  return { service, prisma, tx, update };
}

describe('notification endpoint quotas', () => {
  it('rechecks the total endpoint quota under a user row lock when the URL changes', async () => {
    const { service, tx, update } = createEndpointUpdateHarness(
      ['https://one.example.com/hook', 'https://two.example.com/hook'],
      {
        WEBHOOK_MAX_ENDPOINTS_PER_USER: '2',
        WEBHOOK_MAX_ENDPOINTS_PER_HOST_PER_USER: '3',
      },
    );

    await expect(
      service.updateEndpoint(user, endpointRecord().id, {
        target_url: 'https://new.example.com/hook',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.notificationEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        deletedAt: null,
        id: { not: endpointRecord().id },
      },
      select: { targetUrl: true },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('rechecks the target hostname quota while excluding the endpoint being updated', async () => {
    const { service, tx, update } = createEndpointUpdateHarness(
      ['https://new.example.com/one', 'https://new.example.com/two'],
      {
        WEBHOOK_MAX_ENDPOINTS_PER_USER: '10',
        WEBHOOK_MAX_ENDPOINTS_PER_HOST_PER_USER: '2',
      },
    );

    await expect(
      service.updateEndpoint(user, endpointRecord().id, {
        target_url: 'https://new.example.com/hook',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('applies per-user and higher global hostname limits to endpoint tests', async () => {
    const assertAllowed = jest.fn();
    const endpoint = endpointRecord('https://shared.example.com./hooks/secret');
    const prisma = {
      notificationEndpoint: {
        findFirst: jest.fn().mockResolvedValue(endpoint),
        update: jest.fn().mockResolvedValue(endpoint),
      },
    };
    const outboundHttpService = {
      postJson: jest.fn().mockResolvedValue({ status: 204, ok: true, body: '' }),
    };
    const service = new NotificationEndpointsService(
      prisma as unknown as PrismaService,
      outboundHttpService as unknown as OutboundHttpService,
      { assertAllowed } as unknown as RateLimitService,
      new ConfigService({
        WEBHOOK_TESTS_PER_WINDOW: '5',
        WEBHOOK_TEST_WINDOW_MS: '60000',
        WEBHOOK_GLOBAL_HOST_TESTS_PER_WINDOW: '120',
      }),
    );

    await service.testEndpoint(user, endpoint.id);

    expect(assertAllowed).toHaveBeenCalledWith(
      `webhook:test:user-host:${user.id}:shared.example.com`,
      5,
      60_000,
    );
    expect(assertAllowed).toHaveBeenCalledWith(
      'webhook:test:host:shared.example.com',
      120,
      60_000,
    );
  });

  it('does not use the low per-user allowance as the global hostname create limit', async () => {
    const assertAllowed = jest.fn();
    const endpoint = endpointRecord('https://shared.example.com./hooks/secret');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: user.id }]),
      notificationEndpoint: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(endpoint),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const outboundHttpService = {
      validateUrl: jest.fn().mockResolvedValue({
        url: new URL(endpoint.targetUrl),
        hostname: 'shared.example.com.',
        addresses: ['203.0.113.10'],
      }),
    };
    const service = new NotificationEndpointsService(
      prisma as unknown as PrismaService,
      outboundHttpService as unknown as OutboundHttpService,
      { assertAllowed } as unknown as RateLimitService,
      new ConfigService({
        WEBHOOK_CREATES_PER_WINDOW: '5',
        WEBHOOK_CREATE_WINDOW_MS: '60000',
        WEBHOOK_GLOBAL_HOST_CREATES_PER_WINDOW: '120',
      }),
    );

    await service.createEndpoint(user, {
      name: 'Webhook',
      target_url: endpoint.targetUrl,
    });

    expect(assertAllowed).toHaveBeenCalledWith(
      `webhook:create:user:${user.id}`,
      5,
      60_000,
    );
    expect(assertAllowed).toHaveBeenCalledWith(
      `webhook:create:user-host:${user.id}:shared.example.com`,
      5,
      60_000,
    );
    expect(assertAllowed).toHaveBeenCalledWith(
      'webhook:create:host:shared.example.com',
      120,
      60_000,
    );
  });
});
