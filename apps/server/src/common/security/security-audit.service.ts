import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SecurityAuditAction, SecurityAuditResult } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
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
      const entry = {
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
        createdAt: new Date(),
      };
      // The advisory lock serializes chain writers so concurrent events
      // cannot fork the hash chain; it is transaction-scoped and released
      // automatically on commit or rollback.
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`;
        // Ordered by chainIndex, not chainSeq: the sequence-backed chainSeq
        // skips values on rollback and is not covered by the hash, so only
        // chainIndex is authoritative for "the latest chained row".
        const previous = await tx.securityAuditLog.findFirst({
          where: { chainIndex: { not: null } },
          orderBy: { chainIndex: 'desc' },
          select: { entryHash: true, chainIndex: true },
        });
        const prevHash = previous?.entryHash ?? AUDIT_CHAIN_GENESIS;
        // chainSeq comes from a Postgres sequence, which skips values on any
        // rolled-back transaction, so continuity is tracked by a counter this
        // code owns and hashes instead.
        const chainIndex = (previous?.chainIndex ?? 0n) + 1n;
        const chained = { ...entry, chainIndex };
        const entryHash = computeAuditEntryHash(prevHash, chained);
        await tx.securityAuditLog.create({
          data: { ...chained, prevHash, entryHash },
        });
        // The head lets a verifier notice rows deleted off the end, which the
        // chain alone cannot show.
        await tx.securityAuditChainHead.upsert({
          where: { id: AUDIT_CHAIN_HEAD_ID },
          create: { id: AUDIT_CHAIN_HEAD_ID, chainIndex, entryHash },
          update: { chainIndex, entryHash },
        });
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

  /**
   * Recomputes every hash in the stored chain and compares its end against the
   * persisted head. Exposed so an operator (and the periodic job) can check the
   * control instead of trusting that it was written correctly.
   */
  async verifyChain(): Promise<AuditChainReport> {
    const [entries, head] = await Promise.all([
      this.prisma.securityAuditLog.findMany({
        where: { chainIndex: { not: null } },
        orderBy: { chainIndex: 'asc' },
        select: {
          id: true,
          action: true,
          result: true,
          actorUserId: true,
          targetUserId: true,
          ipAddress: true,
          sessionId: true,
          requestId: true,
          metadata: true,
          createdAt: true,
          chainSeq: true,
          chainIndex: true,
          prevHash: true,
          entryHash: true,
        },
      }),
      this.prisma.securityAuditChainHead.findUnique({
        where: { id: AUDIT_CHAIN_HEAD_ID },
      }),
    ]);

    const result = verifyAuditChain(
      entries,
      head ? { chainIndex: head.chainIndex, entryHash: head.entryHash } : undefined,
    );
    return {
      ...result,
      head: head ? { chainIndex: head.chainIndex, entryHash: head.entryHash } : null,
    };
  }

  private boundString(value: string | null | undefined, maxLength: number) {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
  }
}

export const AUDIT_CHAIN_GENESIS = '0'.repeat(64);
// Arbitrary but fixed application-wide advisory lock key for chain writes.
export const AUDIT_CHAIN_LOCK_KEY = 913_571;
// The head table holds exactly one row.
export const AUDIT_CHAIN_HEAD_ID = 1;

export interface AuditChainEntry {
  id: string;
  action: string;
  result: string;
  actorUserId: string | null;
  targetUserId: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  requestId: string | null;
  metadata?: unknown;
  createdAt: Date;
  chainIndex: bigint | number | null;
}

export interface AuditChainHead {
  chainIndex: bigint | number;
  entryHash: string;
}

export type AuditChainFailureReason =
  | 'genesis_mismatch'
  | 'chain_index_gap'
  | 'prev_hash_mismatch'
  | 'entry_hash_mismatch'
  | 'head_mismatch';

export interface AuditChainResult {
  valid: boolean;
  checked: number;
  brokenAtChainSeq?: bigint | number;
  reason?: AuditChainFailureReason;
}

export interface AuditChainReport extends AuditChainResult {
  head: AuditChainHead | null;
}

/**
 * Order-independent JSON encoding. `metadata` is stored as Postgres jsonb,
 * which canonicalises key order on write, so hashing `JSON.stringify` of the
 * in-memory object makes the write-side hash disagree with every later read.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

export function computeAuditEntryHash(prevHash: string, entry: AuditChainEntry): string {
  const canonical = JSON.stringify([
    prevHash,
    entry.chainIndex === null || entry.chainIndex === undefined
      ? null
      : String(entry.chainIndex),
    entry.id,
    entry.action,
    entry.result,
    entry.actorUserId,
    entry.targetUserId,
    entry.ipAddress,
    entry.sessionId,
    entry.requestId,
    canonicalize(entry.metadata ?? null),
    entry.createdAt.toISOString(),
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Walks the chain in sequence order and recomputes every hash. Rows written
 * before the chain existed carry a null chainIndex and are skipped; every
 * chained row is anchored to genesis, required to be contiguous, and — when a
 * head is supplied — required to still be the last row on record.
 */
export function verifyAuditChain(
  entries: Array<
    AuditChainEntry & {
      chainSeq: bigint | number;
      prevHash: string | null;
      entryHash: string | null;
    }
  >,
  head?: AuditChainHead,
): AuditChainResult {
  let expectedPrev = AUDIT_CHAIN_GENESIS;
  let expectedIndex = 1n;
  let checked = 0;
  let lastEntryHash: string | null = null;
  let lastIndex: bigint | null = null;

  for (const entry of entries) {
    if (entry.chainIndex === null || entry.chainIndex === undefined) {
      continue;
    }

    const prevHash = entry.prevHash ?? AUDIT_CHAIN_GENESIS;
    // Anchoring the first surviving row to genesis is what makes "delete the
    // oldest N rows" detectable; the suffix verifies perfectly on its own.
    if (checked === 0 && prevHash !== AUDIT_CHAIN_GENESIS) {
      return {
        valid: false,
        checked,
        brokenAtChainSeq: entry.chainSeq,
        reason: 'genesis_mismatch',
      };
    }
    if (BigInt(entry.chainIndex) !== expectedIndex) {
      return {
        valid: false,
        checked,
        brokenAtChainSeq: entry.chainSeq,
        reason: 'chain_index_gap',
      };
    }
    if (prevHash !== expectedPrev) {
      return {
        valid: false,
        checked,
        brokenAtChainSeq: entry.chainSeq,
        reason: 'prev_hash_mismatch',
      };
    }
    if (!entry.entryHash || computeAuditEntryHash(prevHash, entry) !== entry.entryHash) {
      return {
        valid: false,
        checked,
        brokenAtChainSeq: entry.chainSeq,
        reason: 'entry_hash_mismatch',
      };
    }

    expectedPrev = entry.entryHash;
    lastEntryHash = entry.entryHash;
    lastIndex = BigInt(entry.chainIndex);
    expectedIndex += 1n;
    checked += 1;
  }

  if (
    head &&
    (lastEntryHash !== head.entryHash ||
      lastIndex === null ||
      lastIndex !== BigInt(head.chainIndex))
  ) {
    return { valid: false, checked, reason: 'head_mismatch' };
  }

  return { valid: true, checked };
}

const SECRET_KEY_PATTERN =
  /(pass(word)?|token|secret|cookie|authorization|signature|private.?key|otp|totp|recovery|credential)/i;

// Value-level scanning: secrets hidden inside otherwise innocent values.
const URL_USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;
const URL_SECRET_QUERY_PATTERN =
  /([?&][^=&\s]*(?:token|secret|key|password|signature|auth|code|credential)[^=&\s]*=)[^&\s"']+/gi;
const BEARER_PATTERN = /\b(bearer|basic)\s+[a-z0-9._~+/=-]{6,}/gi;
const JWT_PATTERN = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{4,}\.[a-z0-9_-]{4,}\b/gi;

function sanitizeStringValue(value: string): string {
  return value
    .replace(URL_USERINFO_PATTERN, '$1[REDACTED]@')
    .replace(URL_SECRET_QUERY_PATTERN, '$1[REDACTED]')
    .replace(BEARER_PATTERN, '$1 [REDACTED]')
    .replace(JWT_PATTERN, '[REDACTED]');
}

export function sanitizeMetadata(value: unknown): Prisma.JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const scanned = sanitizeStringValue(value);
    return scanned.length > 512 ? `${scanned.slice(0, 512)}...` : scanned;
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
