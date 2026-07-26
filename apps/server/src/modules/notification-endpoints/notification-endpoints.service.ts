import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationEndpointType, Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboundHttpService } from '../../common/security/outbound-http.service';
import { RateLimitService } from '../../common/security/rate-limit.service';
import { decryptSecret, encryptSecret } from '../../common/security/secret.util';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { CreateNotificationEndpointDto } from './dto/create-notification-endpoint.dto';
import {
  defaultPayloadTemplate,
  inferNotificationDeliveryKind,
  renderPayloadTemplate,
} from './notification-endpoint-template.util';
import { UpdateNotificationEndpointDto } from './dto/update-notification-endpoint.dto';

type NotificationEndpointRecord = Prisma.NotificationEndpointGetPayload<{
  select: {
    id: true;
    userId: true;
    type: true;
    name: true;
    targetUrl: true;
    secret: true;
    payloadTemplate: true;
    isEnabled: true;
    lastSuccessAt: true;
    lastFailureAt: true;
    lastResponseCode: true;
    lastResponseSummary: true;
    createdAt: true;
    updatedAt: true;
    deletedAt: true;
  };
}>;

@Injectable()
export class NotificationEndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundHttpService: OutboundHttpService,
    @Optional() private readonly rateLimitService?: RateLimitService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly securityAuditService?: SecurityAuditService,
  ) {}

  async getEndpoints(user: AuthenticatedUser) {
    const items = await this.prisma.notificationEndpoint.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: this.endpointSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        items: items.map((item) => this.toPublicEndpoint(item)),
      },
    };
  }

  async createEndpoint(user: AuthenticatedUser, dto: CreateNotificationEndpointDto) {
    this.assertCreateQuota(user.id);
    const validatedUrl = await this.outboundHttpService.validateUrl(dto.target_url);
    const hostname = normalizeHostname(validatedUrl.hostname);
    this.assertCreateQuota(user.id, hostname);
    const maxEndpoints = this.getPositiveNumber('WEBHOOK_MAX_ENDPOINTS_PER_USER', 10);
    const maxEndpointsPerHost = this.getPositiveNumber(
      'WEBHOOK_MAX_ENDPOINTS_PER_HOST_PER_USER',
      3,
    );
    const endpoint = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "users"
        WHERE "id" = ${user.id}::uuid
        FOR UPDATE
      `);
      const endpoints = await tx.notificationEndpoint.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { targetUrl: true },
      });
      if (endpoints.length >= maxEndpoints) {
        throw this.endpointQuotaExceeded('webhook endpoint quota has been reached');
      }
      const hostnameCount = endpoints.reduce((count, item) => {
        try {
          return normalizeHostname(new URL(item.targetUrl).hostname) === hostname
            ? count + 1
            : count;
        } catch {
          return count;
        }
      }, 0);
      if (hostnameCount >= maxEndpointsPerHost) {
        throw this.endpointQuotaExceeded('webhook hostname quota has been reached');
      }

      return tx.notificationEndpoint.create({
        data: {
          userId: user.id,
          type: dto.type ?? NotificationEndpointType.webhook,
          name: dto.name.trim(),
          targetUrl: validatedUrl.url.toString(),
          secret: this.serializeSecret(dto.secret),
          payloadTemplate: dto.payload_template?.trim() || null,
          isEnabled: dto.is_enabled ?? true,
        },
        select: this.endpointSelect(),
      });
    });

    await this.recordAudit({
      action: 'webhook_created',
      result: 'success',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { endpoint_id: endpoint.id, target: redactTargetUrl(endpoint.targetUrl) },
    });

    return {
      code: 'OK',
      message: 'success',
      data: this.toPublicEndpoint(endpoint),
    };
  }

  async getEndpoint(user: AuthenticatedUser, id: string) {
    const endpoint = await this.findEndpointOrThrow(user.id, id);
    return {
      code: 'OK',
      message: 'success',
      data: this.toPublicEndpoint(endpoint),
    };
  }

  async updateEndpoint(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateNotificationEndpointDto,
  ) {
    const existingEndpoint = await this.findEndpointOrThrow(user.id, id);

    const data: Record<string, unknown> = {};
    let targetHostname: string | undefined;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.target_url !== undefined) {
      // List/detail responses deliberately hide path and query secrets. The
      // client sends that masked value back when editing unrelated fields;
      // preserve the stored target in that case instead of overwriting it or
      // forcing the user to reveal the secret URL again.
      if (!isRedactedTargetFor(existingEndpoint.targetUrl, dto.target_url)) {
        // A URL change triggers the same outbound validation (and therefore
        // DNS resolution) as creating an endpoint, so it consumes the same
        // create quota to prevent unbounded resolution probing via updates.
        this.assertCreateQuota(user.id);
        const validatedUrl = await this.outboundHttpService.validateUrl(dto.target_url);
        data.targetUrl = validatedUrl.url.toString();
        targetHostname = normalizeHostname(validatedUrl.hostname);
        this.assertCreateQuota(user.id, targetHostname);
      }
    }
    if (dto.secret !== undefined) data.secret = this.serializeSecret(dto.secret);
    if (dto.payload_template !== undefined) data.payloadTemplate = dto.payload_template?.trim() || null;
    if (dto.is_enabled !== undefined) data.isEnabled = dto.is_enabled;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'no notification endpoint fields to update',
      });
    }

    const updateEndpoint = (tx: Prisma.TransactionClient) =>
      tx.notificationEndpoint.update({
        where: { id },
        data,
        select: this.endpointSelect(),
      });
    const endpoint = targetHostname
      ? await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`
            SELECT "id"
            FROM "users"
            WHERE "id" = ${user.id}::uuid
            FOR UPDATE
          `);
          const otherEndpoints = await tx.notificationEndpoint.findMany({
            where: {
              userId: user.id,
              deletedAt: null,
              id: { not: id },
            },
            select: { targetUrl: true },
          });
          const maxEndpoints = this.getPositiveNumber('WEBHOOK_MAX_ENDPOINTS_PER_USER', 10);
          const maxEndpointsPerHost = this.getPositiveNumber(
            'WEBHOOK_MAX_ENDPOINTS_PER_HOST_PER_USER',
            3,
          );
          if (otherEndpoints.length >= maxEndpoints) {
            throw this.endpointQuotaExceeded('webhook endpoint quota has been reached');
          }
          const hostnameCount = otherEndpoints.reduce((count, item) => {
            try {
              return normalizeHostname(new URL(item.targetUrl).hostname) === targetHostname
                ? count + 1
                : count;
            } catch {
              return count;
            }
          }, 0);
          if (hostnameCount >= maxEndpointsPerHost) {
            throw this.endpointQuotaExceeded('webhook hostname quota has been reached');
          }

          return updateEndpoint(tx);
        })
      : await this.prisma.notificationEndpoint.update({
          where: { id },
          data,
          select: this.endpointSelect(),
        });

    if (dto.is_enabled === false) {
      await this.cancelPendingDeliveries(endpoint.id, 'endpoint_disabled');
    }
    await this.recordAudit({
      action: 'webhook_updated',
      result: 'success',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { endpoint_id: endpoint.id, fields: Object.keys(data) },
    });

    return {
      code: 'OK',
      message: 'success',
      data: this.toPublicEndpoint(endpoint),
    };
  }

  async deleteEndpoint(user: AuthenticatedUser, id: string) {
    await this.findEndpointOrThrow(user.id, id);

    const endpoint = await this.prisma.notificationEndpoint.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isEnabled: false,
      },
      select: this.endpointSelect(),
    });

    await this.cancelPendingDeliveries(endpoint.id, 'endpoint_deleted');
    await this.recordAudit({
      action: 'webhook_deleted',
      result: 'success',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { endpoint_id: endpoint.id },
    });

    return {
      code: 'OK',
      message: 'success',
      data: this.toPublicEndpoint(endpoint),
    };
  }

  async testEndpoint(user: AuthenticatedUser, id: string) {
    const endpoint = await this.findEndpointForDeliveryOrThrow(user.id, id);
    this.assertTestQuota(user.id, id, new URL(endpoint.targetUrl).hostname);
    const testedAt = new Date();
    const deliveryKind = inferNotificationDeliveryKind(endpoint.targetUrl);
    const isWeComRobot = deliveryKind === 'wecom_robot';
    const secret = this.deserializeSecret(endpoint.secret);
    const requestUrl = this.buildTestRequestUrl(endpoint.targetUrl, secret, isWeComRobot);
    const body = renderPayloadTemplate(
      endpoint.payloadTemplate || defaultPayloadTemplate(deliveryKind),
      {
        endpoint_id: endpoint.id,
        endpoint_name: endpoint.name,
        type: endpoint.type,
        tested_at: testedAt.toISOString(),
        delivery_id: 'test_delivery',
        reminder_event_id: 'test_event',
        channel: 'webhook',
        scheduled_for: testedAt.toISOString(),
        triggered_at: testedAt.toISOString(),
        user_id: user.id,
        user_timezone: user.timezone,
        todo_id: 'test_todo',
        todo_title: '测试任务',
        todo_description: '这是一条测试通知',
        todo_status: 'pending',
        todo_priority: 'medium',
        todo_due_at: '',
        payload_json: {
          mode: 'test',
          message: '这是一条 CloudTodo 通知方式测试消息。',
        },
        payload_text: '这是一条 CloudTodo 通知方式测试消息。',
      },
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CloudTodo-Webhook-Test/1.0',
      'X-CloudTodo-Timestamp': String(Math.floor(testedAt.getTime() / 1000)),
      'X-CloudTodo-Event-Id': 'test_event',
      'X-CloudTodo-Delivery-Id': 'test_delivery',
      'X-CloudTodo-Signature-Version': '2',
    };

    if (secret && !isWeComRobot) {
      headers['X-CloudTodo-Signature'] = createHmac('sha256', secret)
        .update(
          `${headers['X-CloudTodo-Timestamp']}.${headers['X-CloudTodo-Event-Id']}.${headers['X-CloudTodo-Delivery-Id']}.${body}`,
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

      if (!response.ok || weComBusinessFailed) {
        await this.prisma.notificationEndpoint.update({
          where: { id: endpoint.id },
          data: {
            lastFailureAt: testedAt,
            lastResponseCode: response.status,
            lastResponseSummary: !response.ok
              ? `HTTP ${response.status}`
              : 'provider rejected the request',
          },
        });

        throw new BadRequestException({
          code: 'NOTIFICATION_ENDPOINT_TEST_FAILED',
          message: 'endpoint test failed',
          details: {
            endpoint_id: endpoint.id,
            target_url: redactTargetUrl(endpoint.targetUrl),
            status: response.status,
          },
        });
      }

      await this.prisma.notificationEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastSuccessAt: testedAt,
          lastResponseCode: response.status,
          lastResponseSummary: `HTTP ${response.status}`,
        },
      });

      await this.recordAudit({
        action: 'webhook_tested',
        result: 'success',
        actorUserId: user.id,
        targetUserId: user.id,
        metadata: { endpoint_id: endpoint.id, status: response.status },
      });

      return {
        code: 'OK',
        message: 'success',
        data: {
          endpoint_id: endpoint.id,
          type: endpoint.type,
          target_url: redactTargetUrl(endpoint.targetUrl),
          tested_at: testedAt.toISOString(),
          status: 'success',
          provider: isWeComRobot ? 'wecom_robot' : 'standard_webhook',
          response_code: response.status,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        await this.recordAudit({
          action: 'webhook_tested',
          result: 'failure',
          actorUserId: user.id,
          targetUserId: user.id,
          metadata: { endpoint_id: endpoint.id },
        });
        throw error;
      }

      await this.prisma.notificationEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastFailureAt: testedAt,
          lastResponseCode: null,
          lastResponseSummary: 'request failed',
        },
      });

      await this.recordAudit({
        action: 'webhook_tested',
        result: 'failure',
        actorUserId: user.id,
        targetUserId: user.id,
        metadata: { endpoint_id: endpoint.id },
      });

      throw new BadRequestException({
        code: 'NOTIFICATION_ENDPOINT_TEST_FAILED',
        message: 'endpoint test request failed',
        details: {
          endpoint_id: endpoint.id,
          target_url: redactTargetUrl(endpoint.targetUrl),
        },
      });
    }
  }

  private buildTestRequestUrl(targetUrl: string, secret: string | null, isWeComRobot: boolean) {
    if (!isWeComRobot || !secret) {
      return targetUrl;
    }

    const timestamp = Date.now().toString();
    const sign = encodeURIComponent(
      createHmac('sha256', secret)
        .update(`${timestamp}\n${secret}`)
        .digest('base64'),
    );
    const url = new URL(targetUrl);
    url.searchParams.set('timestamp', timestamp);
    url.searchParams.set('sign', sign);
    return url.toString();
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

  private async findEndpointOrThrow(userId: string, id: string) {
    const endpoint = await this.prisma.notificationEndpoint.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      select: this.endpointSelect(),
    });

    if (!endpoint) {
      throw new NotFoundException({
        code: 'NOTIFICATION_ENDPOINT_NOT_FOUND',
        message: 'notification endpoint not found',
      });
    }

    return endpoint;
  }

  private async findEndpointForDeliveryOrThrow(userId: string, id: string) {
    const endpoint = await this.prisma.notificationEndpoint.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
        isEnabled: true,
      },
      select: this.endpointSelect(),
    });

    if (!endpoint) {
      throw new NotFoundException({
        code: 'NOTIFICATION_ENDPOINT_NOT_FOUND',
        message: 'notification endpoint not found',
      });
    }

    return endpoint;
  }

  private endpointSelect() {
    return {
      id: true,
      userId: true,
      type: true,
      name: true,
      targetUrl: true,
      secret: true,
      payloadTemplate: true,
      isEnabled: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      lastResponseCode: true,
      lastResponseSummary: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    };
  }

  private toPublicEndpoint(endpoint: NotificationEndpointRecord) {
    const { secret, ...publicEndpoint } = endpoint;
    return {
      ...publicEndpoint,
      provider: inferNotificationDeliveryKind(endpoint.targetUrl),
      targetUrl: redactTargetUrl(endpoint.targetUrl),
      lastResponseSummary: endpoint.lastResponseSummary
        ? redactResponseSummary(endpoint.lastResponseSummary)
        : null,
      secretExists: Boolean(secret),
    };
  }

  private assertTestQuota(userId: string, endpointId: string, hostname?: string) {
    if (!this.rateLimitService) {
      return;
    }

    const limit = this.getPositiveNumber('WEBHOOK_TESTS_PER_WINDOW', 5);
    const windowMs = this.getPositiveNumber('WEBHOOK_TEST_WINDOW_MS', 15 * 60 * 1000);
    this.rateLimitService.assertAllowed(`webhook:test:user:${userId}`, limit, windowMs);
    this.rateLimitService.assertAllowed(`webhook:test:endpoint:${endpointId}`, limit, windowMs);
    if (hostname) {
      const normalizedHostname = normalizeHostname(hostname);
      this.rateLimitService.assertAllowed(
        `webhook:test:user-host:${userId}:${normalizedHostname}`,
        limit,
        windowMs,
      );
      const globalHostLimit = Math.max(
        limit * 20,
        this.getPositiveNumber('WEBHOOK_GLOBAL_HOST_TESTS_PER_WINDOW', limit * 20),
      );
      this.rateLimitService.assertAllowed(
        `webhook:test:host:${normalizedHostname}`,
        globalHostLimit,
        windowMs,
      );
    }
  }

  private assertCreateQuota(userId: string, hostname?: string) {
    if (!this.rateLimitService) {
      return;
    }
    const limit = this.getPositiveNumber('WEBHOOK_CREATES_PER_WINDOW', 5);
    const windowMs = this.getPositiveNumber('WEBHOOK_CREATE_WINDOW_MS', 60 * 60 * 1000);
    if (!hostname) {
      this.rateLimitService.assertAllowed(
        `webhook:create:user:${userId}`,
        limit,
        windowMs,
      );
      return;
    }

    const normalizedHostname = normalizeHostname(hostname);
    this.rateLimitService.assertAllowed(
      `webhook:create:user-host:${userId}:${normalizedHostname}`,
      limit,
      windowMs,
    );
    const globalHostLimit = Math.max(
      limit * 20,
      this.getPositiveNumber('WEBHOOK_GLOBAL_HOST_CREATES_PER_WINDOW', limit * 20),
    );
    this.rateLimitService.assertAllowed(
      `webhook:create:host:${normalizedHostname}`,
      globalHostLimit,
      windowMs,
    );
  }

  private endpointQuotaExceeded(message: string) {
    return new HttpException(
      { code: 'WEBHOOK_QUOTA_EXCEEDED', message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async cancelPendingDeliveries(endpointId: string, reason: string) {
    await this.prisma.notificationDelivery.updateMany({
      where: {
        endpointId,
        status: {
          in: ['pending', 'failed', 'processing'],
        },
      },
      data: {
        status: 'dead_letter',
        nextRetryAt: null,
        lastError: reason,
      },
    });
  }

  private getPositiveNumber(key: string, fallback: number) {
    const configured = Number(this.configService?.get<string>(key));
    return Number.isFinite(configured) && configured > 0 ? configured : fallback;
  }

  private async recordAudit(input: Parameters<SecurityAuditService['record']>[0]) {
    if (this.securityAuditService) {
      await this.securityAuditService.record(input);
    }
  }

  private serializeSecret(secret: string | null | undefined) {
    const trimmed = secret?.trim();
    return trimmed ? encryptSecret(trimmed) : null;
  }

  private deserializeSecret(secret: string | null) {
    return secret ? decryptSecret(secret) : null;
  }
}

function redactTargetUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}/[redacted]`;
  } catch {
    return '[redacted-url]';
  }
}

function isRedactedTargetFor(storedUrl: string, submittedUrl: string) {
  try {
    const stored = new URL(storedUrl);
    const submitted = new URL(submittedUrl);
    return (
      submitted.origin === stored.origin &&
      submitted.pathname === '/[redacted]' &&
      !submitted.search &&
      !submitted.hash
    );
  } catch {
    return false;
  }
}

function redactResponseSummary(summary: string) {
  return summary.replace(/https?:\/\/[^\s]+/gi, '[redacted-url]').slice(0, 120);
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.+$/, '');
}
