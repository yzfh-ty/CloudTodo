import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationDeliveryStatus,
  NotificationEndpointType,
  Prisma,
  ReminderChannel,
  ReminderEventStatus,
  ReminderRepeatType,
  ReminderStatus,
  TodoStatus,
  UserStatus,
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboundHttpService } from '../../common/security/outbound-http.service';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import { decryptSecret } from '../../common/security/secret.util';
import {
  defaultPayloadTemplate,
  inferNotificationDeliveryKind,
  renderPayloadTemplate,
} from '../notification-endpoints/notification-endpoint-template.util';
import { calculateNextRemindAt } from './utils/repeat-rule.util';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private reminderTimer?: NodeJS.Timeout;
  private deliveryTimer?: NodeJS.Timeout;
  private reminderTickRunning = false;
  private deliveryTickRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly outboundHttpService: OutboundHttpService,
    @Optional() private readonly securityAuditService?: SecurityAuditService,
  ) {}

  onModuleInit() {
    const enabled = this.configService.get<string>('SCHEDULER_ENABLED') !== 'false';
    if (!enabled) {
      this.logger.log('Scheduler is disabled by configuration');
      return;
    }

    const reminderInterval = Number(
      this.configService.get<string>('SCHEDULER_SCAN_INTERVAL_MS') ?? 5000,
    );
    const deliveryInterval = Number(
      this.configService.get<string>('DELIVERY_SCAN_INTERVAL_MS') ?? 5000,
    );

    this.reminderTimer = setInterval(() => {
      void this.processDueReminders();
    }, reminderInterval);
    this.deliveryTimer = setInterval(() => {
      void this.processPendingDeliveries();
    }, deliveryInterval);

    void this.processDueReminders();
    void this.processPendingDeliveries();
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
    }

    if (this.deliveryTimer) {
      clearInterval(this.deliveryTimer);
    }
  }

  private async processDueReminders() {
    if (this.reminderTickRunning) {
      return;
    }

    this.reminderTickRunning = true;

    try {
      const dueReminders = await this.prisma.reminder.findMany({
        where: {
          deletedAt: null,
          status: ReminderStatus.pending,
          remindAt: {
            lte: new Date(),
          },
        },
        take: 20,
        orderBy: {
          remindAt: 'asc',
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

      for (const reminder of dueReminders) {
        const now = new Date();
        const dedupeKey = `${reminder.id}:${reminder.remindAt.toISOString()}:${reminder.channel}`;
        const payload: Prisma.InputJsonValue = {
          todo_id: reminder.todo.id,
          todo_title: reminder.todo.title,
          todo_description: reminder.todo.description,
          todo_status: reminder.todo.status,
          todo_priority: reminder.todo.priority,
          todo_due_at: reminder.todo.dueAt?.toISOString() ?? null,
          reminder_id: reminder.id,
          channel: reminder.channel,
          remind_at: reminder.remindAt.toISOString(),
        };
        const nextRemindAt = calculateNextRemindAt(reminder, now);

        await this.prisma.$transaction(async (tx) => {
          const existingEvent = await tx.reminderEvent.findUnique({
            where: {
              dedupeKey,
            },
            select: { id: true },
          });

          if (existingEvent) {
            await tx.reminder.update({
              where: { id: reminder.id },
              data: {
                status: ReminderStatus.triggered,
                lastTriggeredAt: new Date(),
              },
            });
            return;
          }

          const event = await tx.reminderEvent.create({
            data: {
              reminderId: reminder.id,
              todoId: reminder.todoId,
              userId: reminder.userId,
              channel: reminder.channel,
              scheduledFor: reminder.remindAt,
              triggeredAt: new Date(),
              dedupeKey,
              status: ReminderEventStatus.pending,
              payload,
            },
            select: {
              id: true,
            },
          });

          await tx.reminder.update({
            where: { id: reminder.id },
            data: {
              lastTriggeredAt: now,
              ...(nextRemindAt
                ? {
                    status: ReminderStatus.pending,
                    remindAt: nextRemindAt,
                  }
                : {
                    status:
                      reminder.repeatType === ReminderRepeatType.none
                        ? ReminderStatus.triggered
                        : ReminderStatus.failed,
                  }),
            },
          });

          if (
            reminder.channel === ReminderChannel.webhook ||
            reminder.channel === ReminderChannel.both
          ) {
            await tx.$queryRaw(Prisma.sql`
              SELECT "id"
              FROM "users"
              WHERE "id" = ${reminder.userId}::uuid
              FOR UPDATE
            `);
            const endpoints = await tx.notificationEndpoint.findMany({
              where: {
                userId: reminder.userId,
                deletedAt: null,
                isEnabled: true,
                type: 'webhook',
              },
              select: {
                id: true,
              },
            });
            const pendingLimit = this.getPositiveNumber(
              'WEBHOOK_MAX_PENDING_DELIVERIES_PER_USER',
              500,
            );
            const dailyLimit = this.getPositiveNumber(
              'WEBHOOK_MAX_DAILY_DELIVERIES_PER_USER',
              1000,
            );
            const pendingCount = await tx.notificationDelivery.count({
              where: {
                reminderEvent: { userId: reminder.userId },
                status: {
                  in: [
                    NotificationDeliveryStatus.pending,
                    NotificationDeliveryStatus.failed,
                    NotificationDeliveryStatus.processing,
                  ],
                },
              },
            });
            const dailyCount = await tx.notificationDelivery.count({
              where: {
                reminderEvent: { userId: reminder.userId },
                createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              },
            });
            const availableSlots = Math.max(
              0,
              Math.min(pendingLimit - pendingCount, dailyLimit - dailyCount),
            );

            for (const endpoint of endpoints.slice(0, availableSlots)) {
              await tx.notificationDelivery.create({
                data: {
                  reminderEventId: event.id,
                  endpointId: endpoint.id,
                  status: NotificationDeliveryStatus.pending,
                },
              });
            }
          }
        });
      }
    } catch (error) {
      this.logger.error('Failed to process due reminders', error as Error);
    } finally {
      this.reminderTickRunning = false;
    }
  }

  private async processPendingDeliveries() {
    if (this.deliveryTickRunning) {
      return;
    }

    this.deliveryTickRunning = true;

    try {
      const scanStartedAt = new Date();
      const processingLeaseMs = this.getDeliveryProcessingLeaseMs();
      const leaseCutoff = new Date(scanStartedAt.getTime() - processingLeaseMs);
      const deliveries = await this.prisma.notificationDelivery.findMany({
        where: this.claimableDeliveryWhere(scanStartedAt, leaseCutoff),
        take: 20,
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          endpoint: true,
          reminderEvent: true,
        },
      });

      for (const delivery of deliveries) {
        const claimedAt = new Date();
        const claimLeaseCutoff = new Date(claimedAt.getTime() - processingLeaseMs);
        const [claim] = await this.prisma.notificationDelivery.updateManyAndReturn({
          where: {
            id: delivery.id,
            ...this.claimableDeliveryWhere(claimedAt, claimLeaseCutoff),
          },
          data: {
            status: NotificationDeliveryStatus.processing,
            updatedAt: claimedAt,
          },
          select: {
            id: true,
            updatedAt: true,
          },
        });

        if (!claim) {
          continue;
        }

        // The sync watermark trigger replaces Prisma's timestamp with the
        // database clock. Its RETURNING value is the lease ownership token.
        await this.deliverWebhook(claim.id, claim.updatedAt);
      }
    } catch (error) {
      this.logger.error('Failed to process pending deliveries', error as Error);
    } finally {
      this.deliveryTickRunning = false;
    }
  }

  private async deliverWebhook(deliveryId: string, claimUpdatedAt: Date) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        endpoint: true,
        reminderEvent: {
          include: {
            user: {
              select: {
                id: true,
                status: true,
                timezone: true,
              },
            },
            todo: {
              select: {
                id: true,
                userId: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                dueAt: true,
                deletedAt: true,
              },
            },
            reminder: {
              select: {
                id: true,
                userId: true,
                todoId: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    if (
      !delivery ||
      delivery.status !== NotificationDeliveryStatus.processing ||
      delivery.updatedAt.getTime() !== claimUpdatedAt.getTime()
    ) {
      return;
    }

    const eventUser = delivery.reminderEvent.user;
    const todo = delivery.reminderEvent.todo;
    const reminder = delivery.reminderEvent.reminder;
    if (
      delivery.endpoint.deletedAt ||
      !delivery.endpoint.isEnabled ||
      delivery.endpoint.type !== NotificationEndpointType.webhook ||
      delivery.endpoint.userId !== delivery.reminderEvent.userId ||
      !eventUser ||
      eventUser.status !== UserStatus.active ||
      !todo ||
      todo.userId !== delivery.reminderEvent.userId ||
      todo.deletedAt ||
      todo.status === TodoStatus.deleted ||
      !reminder ||
      reminder.userId !== delivery.reminderEvent.userId ||
      reminder.todoId !== todo.id ||
      reminder.deletedAt ||
      reminder.status === ReminderStatus.cancelled
    ) {
      await this.cancelDelivery(
        delivery.id,
        claimUpdatedAt,
        'delivery target is no longer active',
        delivery.reminderEvent.userId,
      );
      return;
    }

    const deliveryKind = inferNotificationDeliveryKind(delivery.endpoint.targetUrl);
    const isWeComRobot = deliveryKind === 'wecom_robot';
    const endpointSecret = delivery.endpoint.secret
      ? decryptSecret(delivery.endpoint.secret)
      : null;
    const payloadObject =
      typeof delivery.reminderEvent.payload === 'object' && delivery.reminderEvent.payload !== null
        ? (delivery.reminderEvent.payload as Record<string, unknown>)
        : {};
    const body = renderPayloadTemplate(
      delivery.endpoint.payloadTemplate || defaultPayloadTemplate(deliveryKind),
      {
        endpoint_id: delivery.endpointId,
        endpoint_name: delivery.endpoint.name,
        delivery_id: delivery.id,
        reminder_event_id: delivery.reminderEventId,
        channel: delivery.reminderEvent.channel,
        scheduled_for: delivery.reminderEvent.scheduledFor.toISOString(),
        triggered_at: delivery.reminderEvent.triggeredAt.toISOString(),
        user_id: delivery.reminderEvent.userId,
        user_timezone: eventUser.timezone,
        todo_id: todo.id,
        todo_title: todo.title,
        todo_description: todo.description ?? '',
        todo_status: todo.status,
        todo_priority: todo.priority,
        todo_due_at: todo.dueAt?.toISOString() ?? '',
        payload_json: {
          ...payloadObject,
          todo_id: todo.id,
          todo_title: todo.title,
          todo_description: todo.description,
          todo_status: todo.status,
          todo_priority: todo.priority,
          todo_due_at: todo.dueAt?.toISOString() ?? null,
        },
        payload_text: JSON.stringify({
          ...payloadObject,
          todo_id: todo.id,
          todo_title: todo.title,
          todo_status: todo.status,
        }),
      },
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CloudTodo-Webhook-Worker/1.0',
      'X-CloudTodo-Timestamp': String(Math.floor(Date.now() / 1000)),
      'X-CloudTodo-Event-Id': delivery.reminderEventId,
      'X-CloudTodo-Delivery-Id': delivery.id,
      'X-CloudTodo-Signature-Version': '2',
    };

    let requestUrl = delivery.endpoint.targetUrl;
    // WeCom's fixed scheme signs only "{timestamp}\n{secret}" — body integrity
    // cannot be provided for these targets; see docs/README-security.md §3.
    if (isWeComRobot && endpointSecret) {
      const timestamp = Date.now().toString();
      const sign = encodeURIComponent(
        createHmac('sha256', endpointSecret)
          .update(`${timestamp}\n${endpointSecret}`)
          .digest('base64'),
      );
      const url = new URL(delivery.endpoint.targetUrl);
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('sign', sign);
      requestUrl = url.toString();
    } else if (endpointSecret) {
      // v2 signature also covers the delivery id so a relay cannot swap the
      // X-CloudTodo-Delivery-Id header between two signed requests.
      headers['X-CloudTodo-Signature'] = createHmac('sha256', endpointSecret)
        .update(
          `${headers['X-CloudTodo-Timestamp']}.${headers['X-CloudTodo-Event-Id']}.${delivery.id}.${body}`,
        )
        .digest('hex');
    }

    try {
      const response = await this.outboundHttpService.postJson(requestUrl, headers, body);
      const responseBody = response.body;
      const parsedBody = this.tryParseJson(responseBody);
      const weComBusinessFailed =
        isWeComRobot &&
        parsedBody &&
        typeof parsedBody === 'object' &&
        'errcode' in parsedBody &&
        parsedBody.errcode !== 0;

      if (response.ok && !weComBusinessFailed) {
        const completedAt = new Date();
        const transitioned = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.notificationDelivery.updateMany({
            where: {
              id: delivery.id,
              status: NotificationDeliveryStatus.processing,
              updatedAt: claimUpdatedAt,
            },
            data: {
              status: NotificationDeliveryStatus.success,
              attemptCount: { increment: 1 },
              responseCode: response.status,
              responseBody: null,
              deliveredAt: completedAt,
              nextRetryAt: null,
              lastError: null,
            },
          });

          if (updated.count === 0) {
            return false;
          }

          await tx.notificationEndpoint.update({
            where: { id: delivery.endpointId },
            data: {
              lastSuccessAt: completedAt,
              lastResponseCode: response.status,
              lastResponseSummary: `HTTP ${response.status}`,
            },
          });

          if (delivery.reminderEvent.channel !== ReminderChannel.both) {
            await tx.reminderEvent.update({
              where: { id: delivery.reminderEventId },
              data: {
                status: ReminderEventStatus.processed,
              },
            });
          }

          return true;
        });

        if (!transitioned) {
          return;
        }

        await this.recordDeliveryAudit(
          'webhook_delivery_succeeded',
          'success',
          delivery.reminderEvent.userId,
          delivery.id,
          { endpoint_id: delivery.endpointId, status: response.status },
        );

        return;
      }

      await this.markDeliveryFailure(
        delivery.id,
        claimUpdatedAt,
        delivery.endpointId,
        delivery.attemptCount + 1,
        !response.ok
          ? 'WEBHOOK_HTTP_ERROR'
          : 'WEBHOOK_PROVIDER_REJECTED',
        response.status,
        delivery.reminderEvent.userId,
      );
    } catch {
      await this.markDeliveryFailure(
        delivery.id,
        claimUpdatedAt,
        delivery.endpointId,
        delivery.attemptCount + 1,
        'WEBHOOK_REQUEST_FAILED',
        undefined,
        delivery.reminderEvent.userId,
      );
    }
  }

  private async markDeliveryFailure(
    deliveryId: string,
    claimUpdatedAt: Date,
    endpointId: string,
    nextAttemptCount: number,
    lastError: string,
    responseCode?: number,
    userId?: string,
  ) {
    const maxAttempts = Number(this.configService.get<string>('DELIVERY_MAX_ATTEMPTS') ?? 3);
    const shouldDeadLetter = nextAttemptCount >= maxAttempts;
    const nextRetryAt = shouldDeadLetter
      ? null
      : new Date(Date.now() + nextAttemptCount * 30 * 1000);
    const failedAt = new Date();

    const transitioned = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationDelivery.updateMany({
        where: {
          id: deliveryId,
          status: NotificationDeliveryStatus.processing,
          updatedAt: claimUpdatedAt,
        },
        data: {
          status: shouldDeadLetter
            ? NotificationDeliveryStatus.dead_letter
            : NotificationDeliveryStatus.failed,
          attemptCount: nextAttemptCount,
          nextRetryAt,
          lastError,
          responseCode,
          responseBody: null,
        },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.notificationEndpoint.update({
        where: { id: endpointId },
        data: {
          lastFailureAt: failedAt,
          lastResponseCode: responseCode ?? null,
          lastResponseSummary: responseCode ? `HTTP ${responseCode}` : 'request failed',
        },
      });

      return true;
    });

    if (!transitioned) {
      return;
    }

    if (userId) {
      await this.recordDeliveryAudit(
        'webhook_delivery_failed',
        shouldDeadLetter ? 'blocked' : 'failure',
        userId,
        deliveryId,
        { endpoint_id: endpointId, response_code: responseCode ?? null },
      );
    }
  }

  private async cancelDelivery(
    deliveryId: string,
    claimUpdatedAt: Date,
    reason: string,
    userId: string,
  ) {
    const updated = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: deliveryId,
        status: NotificationDeliveryStatus.processing,
        updatedAt: claimUpdatedAt,
      },
      data: {
        status: NotificationDeliveryStatus.dead_letter,
        nextRetryAt: null,
        responseBody: null,
        lastError: reason,
      },
    });

    if (updated.count === 0) {
      return;
    }

    await this.recordDeliveryAudit(
      'webhook_delivery_blocked',
      'blocked',
      userId,
      deliveryId,
      { reason },
    );
  }

  private async recordDeliveryAudit(
    action: Parameters<SecurityAuditService['record']>[0]['action'],
    result: Parameters<SecurityAuditService['record']>[0]['result'],
    userId: string,
    deliveryId: string,
    metadata: Record<string, unknown>,
  ) {
    if (!this.securityAuditService) {
      return;
    }

    await this.securityAuditService.record({
      action,
      result,
      actorUserId: userId,
      targetUserId: userId,
      metadata: { delivery_id: deliveryId, ...metadata },
    });
  }

  private tryParseJson(responseBody: string) {
    try {
      return JSON.parse(responseBody) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private claimableDeliveryWhere(
    retryCutoff: Date,
    leaseCutoff: Date,
  ): Prisma.NotificationDeliveryWhereInput {
    return {
      OR: [
        {
          status: {
            in: [NotificationDeliveryStatus.pending, NotificationDeliveryStatus.failed],
          },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: retryCutoff } }],
        },
        {
          status: NotificationDeliveryStatus.processing,
          updatedAt: { lte: leaseCutoff },
        },
      ],
    };
  }

  private getDeliveryProcessingLeaseMs() {
    const requestTimeoutMs = this.getPositiveNumber('WEBHOOK_REQUEST_TIMEOUT_MS', 5000);
    const configuredLeaseMs = this.getPositiveNumber(
      'DELIVERY_PROCESSING_LEASE_MS',
      60_000,
    );
    return Math.max(configuredLeaseMs, requestTimeoutMs * 3);
  }

  private getPositiveNumber(key: string, fallback: number) {
    const configured = Number(this.configService.get<string>(key));
    return Number.isFinite(configured) && configured > 0 ? configured : fallback;
  }
}
