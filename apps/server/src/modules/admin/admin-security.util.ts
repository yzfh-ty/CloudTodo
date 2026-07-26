import {
  AdminOperationAction,
  AdminOperationResult,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { sanitizeMetadata } from '../../common/security/security-audit.service';
import { SecurityRequestContextService } from '../../common/security/security-request-context.service';

export async function createAuditLogTx(
  tx: Prisma.TransactionClient,
  requestContextService: SecurityRequestContextService,
  input: {
    adminUserId: string;
    targetUserId?: string;
    action: AdminOperationAction;
    reason: string;
    result: AdminOperationResult;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const context = requestContextService.current();
  await tx.adminOperationLog.create({
    data: {
      adminUserId: input.adminUserId,
      targetUserId: input.targetUserId,
      action: input.action,
      reason: input.reason,
      result: input.result,
      ipAddress: context?.ipAddress?.slice(0, 64) ?? null,
      // Operation logs are readable through the admin API, so they get the
      // same key redaction and size bounds as security audit metadata.
      metadata: sanitizeMetadata(
        Object.assign(
          (input.metadata !== null &&
          typeof input.metadata === 'object' &&
          !Array.isArray(input.metadata)
            ? { ...input.metadata }
            : {}) as Prisma.InputJsonObject,
          context?.sessionId ? { session_id: context.sessionId } : {},
          context?.requestId ? { request_id: context.requestId } : {},
        ),
      ) as Prisma.InputJsonValue,
    },
  });
}

export function generateTemporaryPassword(): string {
  return `Temp#${randomBytes(6).toString('hex')}`;
}

export function generateSecret(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url');
}

export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      status: UserStatus;
      passwordChangedAt: Date | null;
      sessionRevokedAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT
      "id",
      "status",
      "password_changed_at" AS "passwordChangedAt",
      "session_revoked_at" AS "sessionRevokedAt"
    FROM "users"
    WHERE "id" = ${userId}::uuid
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

export function nextSecurityTimestamp(
  ...previous: Array<Date | null | undefined>
) {
  const minimum = previous.reduce(
    (latest, value) => Math.max(latest, value?.getTime() ?? 0),
    0,
  );
  return new Date(Math.max(Date.now(), minimum + 1));
}
