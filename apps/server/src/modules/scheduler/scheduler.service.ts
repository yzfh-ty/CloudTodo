import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationDeliveryStatus,
  Prisma,
  ReminderChannel,
  ReminderEventStatus,
  ReminderRepeatType,
  ReminderStatus,
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
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

          if (reminder.channel === ReminderChannel.webhook) {
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

            for (const endpoint of endpoints) {
              await tx.notificationDelivery.create({
                data: {
                  reminderEventId: event.id,
                  endpointId: endpoint.id,
                  status: NotificationDeliveryStatus.pending,
                },
              });
            }
          } else {
            await tx.reminderEvent.update({
              where: {
                id: event.id,
              },
              data: {
                status: ReminderEventStatus.processed,
              },
            });
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
      const deliveries = await this.prisma.notificationDelivery.findMany({
        where: {
          status: {
            in: [NotificationDeliveryStatus.pending, NotificationDeliveryStatus.failed],
          },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
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
        const claimed = await this.prisma.notificationDelivery.updateMany({
          where: {
            id: delivery.id,
            status: {
              in: [NotificationDeliveryStatus.pending, NotificationDeliveryStatus.failed],
            },
          },
          data: {
            status: NotificationDeliveryStatus.processing,
          },
        });

        if (claimed.count === 0) {
          continue;
        }

        await this.deliverWebhook(delivery.id);
      }
    } catch (error) {
      this.logger.error('Failed to process pending deliveries', error as Error);
    } finally {
      this.deliveryTickRunning = false;
    }
  }

  private async deliverWebhook(deliveryId: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        endpoint: true,
        reminderEvent: true,
      },
    });

    if (!delivery) {
      return;
    }

    const deliveryKind = inferNotificationDeliveryKind(delivery.endpoint.targetUrl);
    const isWeComRobot = deliveryKind === 'wecom_robot';
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
        user_timezone: '',
        todo_id: payloadObject.todo_id ?? '',
        todo_title: payloadObject.todo_title ?? '',
        todo_description: payloadObject.todo_description ?? '',
        todo_status: payloadObject.todo_status ?? '',
        todo_priority: payloadObject.todo_priority ?? '',
        todo_due_at: payloadObject.todo_due_at ?? '',
        payload_json: delivery.reminderEvent.payload,
        payload_text: JSON.stringify(delivery.reminderEvent.payload),
      },
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CloudTodo-Webhook-Worker/1.0',
    };

    let requestUrl = delivery.endpoint.targetUrl;
    if (isWeComRobot && delivery.endpoint.secret) {
      const timestamp = Date.now().toString();
      const sign = encodeURIComponent(
        createHmac('sha256', delivery.endpoint.secret)
          .update(`${timestamp}\n${delivery.endpoint.secret}`)
          .digest('base64'),
      );
      const url = new URL(delivery.endpoint.targetUrl);
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('sign', sign);
      requestUrl = url.toString();
    } else if (delivery.endpoint.secret) {
      headers['X-CloudTodo-Signature'] = createHmac('sha256', delivery.endpoint.secret)
        .update(body)
        .digest('hex');
    }

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers,
        body,
      });

      const responseBody = (await response.text()).slice(0, 2000);
      const parsedBody = this.tryParseJson(responseBody);
      const weComBusinessFailed =
        isWeComRobot &&
        parsedBody &&
        typeof parsedBody === 'object' &&
        'errcode' in parsedBody &&
        parsedBody.errcode !== 0;

      if (response.ok && !weComBusinessFailed) {
        await this.prisma.$transaction([
          this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: NotificationDeliveryStatus.success,
              attemptCount: { increment: 1 },
              responseCode: response.status,
              responseBody,
              deliveredAt: new Date(),
              nextRetryAt: null,
              lastError: null,
            },
          }),
          this.prisma.notificationEndpoint.update({
            where: { id: delivery.endpointId },
            data: {
              lastSuccessAt: new Date(),
              lastResponseCode: response.status,
              lastResponseSummary: responseBody.slice(0, 255),
            },
          }),
          this.prisma.reminderEvent.update({
            where: { id: delivery.reminderEventId },
            data: {
              status: ReminderEventStatus.processed,
            },
          }),
        ]);

        return;
      }

      await this.markDeliveryFailure(
        delivery.id,
        delivery.endpointId,
        delivery.attemptCount + 1,
        !response.ok
          ? `HTTP ${response.status}`
          : this.extractBusinessError(parsedBody),
        response.status,
        responseBody,
      );
    } catch (error) {
      await this.markDeliveryFailure(
        delivery.id,
        delivery.endpointId,
        delivery.attemptCount + 1,
        error instanceof Error ? error.message : 'unknown delivery error',
      );
    }
  }

  private async markDeliveryFailure(
    deliveryId: string,
    endpointId: string,
    nextAttemptCount: number,
    lastError: string,
    responseCode?: number,
    responseBody?: string,
  ) {
    const maxAttempts = Number(this.configService.get<string>('DELIVERY_MAX_ATTEMPTS') ?? 3);
    const shouldDeadLetter = nextAttemptCount >= maxAttempts;
    const nextRetryAt = shouldDeadLetter
      ? null
      : new Date(Date.now() + nextAttemptCount * 30 * 1000);

    await this.prisma.$transaction([
      this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: shouldDeadLetter
            ? NotificationDeliveryStatus.dead_letter
            : NotificationDeliveryStatus.failed,
          attemptCount: nextAttemptCount,
          nextRetryAt,
          lastError,
          responseCode,
          responseBody,
        },
      }),
      this.prisma.notificationEndpoint.update({
        where: { id: endpointId },
        data: {
          lastFailureAt: new Date(),
          lastResponseCode: responseCode ?? null,
          lastResponseSummary: (responseBody ?? lastError).slice(0, 255),
        },
      }),
    ]);
  }

  private tryParseJson(responseBody: string) {
    try {
      return JSON.parse(responseBody) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private extractBusinessError(payload: Record<string, unknown> | null) {
    if (!payload) {
      return 'unknown business error';
    }

    const errCode = payload.errcode;
    const errMsg = payload.errmsg;
    if (typeof errCode === 'number' || typeof errMsg === 'string') {
      return `${errCode ?? 'unknown'} ${errMsg ?? ''}`.trim();
    }

    return 'unknown business error';
  }
}
