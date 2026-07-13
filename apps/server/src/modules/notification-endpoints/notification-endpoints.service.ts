import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationEndpointType, Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboundHttpService } from '../../common/security/outbound-http.service';
import { decryptSecret, encryptSecret } from '../../common/security/secret.util';
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
    await this.outboundHttpService.validateUrl(dto.target_url);
    const endpoint = await this.prisma.notificationEndpoint.create({
      data: {
        userId: user.id,
        type: dto.type ?? NotificationEndpointType.webhook,
        name: dto.name.trim(),
        targetUrl: dto.target_url,
        secret: this.serializeSecret(dto.secret),
        payloadTemplate: dto.payload_template?.trim() || null,
        isEnabled: dto.is_enabled ?? true,
      },
      select: this.endpointSelect(),
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
    await this.findEndpointOrThrow(user.id, id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.target_url !== undefined) {
      await this.outboundHttpService.validateUrl(dto.target_url);
      data.targetUrl = dto.target_url;
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

    const endpoint = await this.prisma.notificationEndpoint.update({
      where: { id },
      data,
      select: this.endpointSelect(),
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

    return {
      code: 'OK',
      message: 'success',
      data: this.toPublicEndpoint(endpoint),
    };
  }

  async testEndpoint(user: AuthenticatedUser, id: string) {
    const endpoint = await this.findEndpointForDeliveryOrThrow(user.id, id);
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
    };

    if (secret && !isWeComRobot) {
      headers['X-CloudTodo-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
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
            lastResponseSummary: responseBody.slice(0, 255),
          },
        });

        throw new BadRequestException({
          code: 'NOTIFICATION_ENDPOINT_TEST_FAILED',
          message: !response.ok
            ? `endpoint test failed with HTTP ${response.status}`
            : `endpoint test failed: ${this.extractBusinessError(parsedBody)}`,
          details: {
            endpoint_id: endpoint.id,
            target_url: endpoint.targetUrl,
            status: response.status,
            response_body: responseBody,
          },
        });
      }

      await this.prisma.notificationEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastSuccessAt: testedAt,
          lastResponseCode: response.status,
          lastResponseSummary: responseBody.slice(0, 255),
        },
      });

      return {
        code: 'OK',
        message: 'success',
        data: {
          endpoint_id: endpoint.id,
          type: endpoint.type,
          target_url: endpoint.targetUrl,
          tested_at: testedAt.toISOString(),
          status: 'success',
          provider: isWeComRobot ? 'wecom_robot' : 'standard_webhook',
          response_code: response.status,
          response_body: responseBody,
          rendered_body: body,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      await this.prisma.notificationEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastFailureAt: testedAt,
          lastResponseCode: null,
          lastResponseSummary: error instanceof Error ? error.message.slice(0, 255) : 'request failed',
        },
      });

      throw new BadRequestException({
        code: 'NOTIFICATION_ENDPOINT_TEST_FAILED',
        message: error instanceof Error ? error.message : 'endpoint test request failed',
        details: {
          endpoint_id: endpoint.id,
          target_url: endpoint.targetUrl,
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
      secretExists: Boolean(secret),
    };
  }

  private serializeSecret(secret: string | null | undefined) {
    const trimmed = secret?.trim();
    return trimmed ? encryptSecret(trimmed) : null;
  }

  private deserializeSecret(secret: string | null) {
    return secret ? decryptSecret(secret) : null;
  }
}
