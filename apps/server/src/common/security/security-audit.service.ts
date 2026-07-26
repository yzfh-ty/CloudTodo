import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SecurityAuditAction, SecurityAuditResult } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { SecurityRequestContextService } from './security-request-context.service';

export interface SecurityAuditInput {
  action: SecurityAuditAction;
  result: SecurityAuditResult;
  actorUserId?: string | null;
  targetUserId?: string | null;
  ipAddress?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Best-effort security event sink. Secrets are removed before persistence so
 * callers can safely include bounded diagnostic context in an event.
 */
@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: SecurityRequestContextService,
  ) {}

  async record(input: SecurityAuditInput): Promise<void> {
    const context = this.requestContext.current();
    try {
      await this.prisma.securityAuditLog.create({
        data: {
          id: randomUUID(),
          actorUserId: input.actorUserId ?? null,
          targetUserId: input.targetUserId ?? null,
          action: input.action,
          result: input.result,
          ipAddress: this.boundString(input.ipAddress ?? context?.ipAddress, 64),
          sessionId: this.boundString(input.sessionId ?? context?.sessionId, 128),
          requestId: this.boundString(input.requestId ?? context?.requestId, 128),
          metadata: input.metadata
            ? (sanitizeMetadata(input.metadata) as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (error) {
      // An audit outage must not turn a valid login/logout into a 500, but it
      // should remain visible to operators.
      this.logger.warn(
        `security audit event could not be persisted: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private boundString(value: string | null | undefined, maxLength: number) {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
  }
}

const SECRET_KEY_PATTERN =
  /(pass(word)?|token|secret|cookie|authorization|signature|private.?key|otp|totp|recovery|credential)/i;

export function sanitizeMetadata(value: unknown): Prisma.JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 512 ? `${value.slice(0, 512)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMetadata(item));
  }

  if (typeof value === 'object') {
    const output: Record<string, Prisma.JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      output[key] = SECRET_KEY_PATTERN.test(key)
        ? '[REDACTED]'
        : sanitizeMetadata(item);
    }
    return output;
  }

  return String(value);
}
