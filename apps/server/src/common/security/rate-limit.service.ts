import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export type RateLimitRequestLike = {
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly maxBuckets: number;
  private readonly trustedProxyIps: Set<string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma?: PrismaService,
  ) {
    const configuredMax = Number(configService.get<string>('RATE_LIMIT_MAX_BUCKETS'));
    this.maxBuckets = Number.isInteger(configuredMax) && configuredMax >= 100
      ? Math.min(configuredMax, 100_000)
      : 10_000;
    this.trustedProxyIps = new Set(
      (configService.get<string>('TRUSTED_PROXY_IPS') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  async assertAllowedShared(key: string, limit: number, windowMs: number) {
    this.assertUsableLimit(key, limit, windowMs);
    if (!this.prisma) {
      this.assertAllowed(key, limit, windowMs);
      return;
    }
    await this.pruneShared();
    const keyHash = this.hashKey(key);
    const charged = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      INSERT INTO "rate_limit_buckets" AS bucket
        ("key_hash", "count", "reset_at", "updated_at")
      VALUES (
        ${keyHash},
        1,
        CURRENT_TIMESTAMP + (${windowMs} * INTERVAL '1 millisecond'),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("key_hash") DO UPDATE SET
        "count" = CASE
          WHEN bucket."reset_at" <= CURRENT_TIMESTAMP THEN 1
          ELSE bucket."count" + 1
        END,
        "reset_at" = CASE
          WHEN bucket."reset_at" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${windowMs} * INTERVAL '1 millisecond')
          ELSE bucket."reset_at"
        END,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE bucket."reset_at" <= CURRENT_TIMESTAMP OR bucket."count" < ${limit}
      RETURNING "count"
    `);
    if (charged.length === 0) this.throwRateLimited('too many requests, please try again later');
  }

  async assertNotLockedShared(key: string, limit: number, windowMs: number) {
    this.assertUsableLimit(key, limit, windowMs);
    if (!this.prisma) {
      this.assertNotLocked(key, limit, windowMs);
      return;
    }
    const locked = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT "count"
      FROM "rate_limit_buckets"
      WHERE "key_hash" = ${this.hashKey(key)}
        AND "reset_at" > CURRENT_TIMESTAMP
        AND "count" >= ${limit}
      LIMIT 1
    `);
    if (locked.length > 0) {
      this.throwRateLimited('too many failed attempts, please try again later');
    }
  }

  async registerFailureShared(key: string, windowMs: number) {
    this.assertUsableLimit(key, 1, windowMs);
    if (!this.prisma) {
      this.registerFailure(key, windowMs);
      return;
    }
    await this.pruneShared();
    const keyHash = this.hashKey(key);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "rate_limit_buckets" AS bucket
        ("key_hash", "count", "reset_at", "updated_at")
      VALUES (
        ${keyHash},
        1,
        CURRENT_TIMESTAMP + (${windowMs} * INTERVAL '1 millisecond'),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("key_hash") DO UPDATE SET
        "count" = CASE
          WHEN bucket."reset_at" <= CURRENT_TIMESTAMP THEN 1
          ELSE bucket."count" + 1
        END,
        "reset_at" = CASE
          WHEN bucket."reset_at" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${windowMs} * INTERVAL '1 millisecond')
          ELSE bucket."reset_at"
        END,
        "updated_at" = CURRENT_TIMESTAMP
    `);
  }

  async releaseShared(key: string) {
    if (!key || key.length > 512) {
      return;
    }
    if (!this.prisma) {
      const bucket = this.buckets.get(key);
      if (!bucket || bucket.resetAt <= Date.now()) {
        return;
      }
      bucket.count -= 1;
      if (bucket.count <= 0) {
        this.buckets.delete(key);
      }
      return;
    }
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "rate_limit_buckets"
      SET "count" = GREATEST("count" - 1, 0),
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "key_hash" = ${this.hashKey(key)}
        AND "reset_at" > CURRENT_TIMESTAMP
        AND "count" > 0
    `);
  }

  assertAllowed(key: string, limit: number, windowMs: number) {
    if (!key || key.length > 512 || !Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs <= 0) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'rate limit configuration is invalid' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const now = Date.now();
    this.prune(now);
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maxBuckets) {
        // Never evict a live bucket in response to an attacker-controlled key.
        // Eviction would let an attacker churn identifiers until a protected
        // IP/session bucket disappears and its quota is reset. Fail closed for
        // new keys until an existing bucket expires instead.
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'rate limiter capacity is temporarily exhausted' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (bucket.count >= limit) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'too many requests, please try again later',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
  }

  /**
   * Read-only counterpart of {@link assertAllowed} for failure-counted limits:
   * it rejects once the bucket is exhausted but never charges the caller. Pair
   * it with {@link registerFailure} so successful verifications stay free and
   * an attacker cannot lock a victim out with valid-looking traffic.
   */
  assertNotLocked(key: string, limit: number, windowMs: number) {
    this.assertUsableLimit(key, limit, windowMs);
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt > Date.now() && bucket.count >= limit) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'too many failed attempts, please try again later',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  registerFailure(key: string, windowMs: number) {
    this.assertUsableLimit(key, 1, windowMs);
    const now = Date.now();
    this.prune(now);
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt > now) {
      bucket.count += 1;
      return;
    }
    if (!bucket && this.buckets.size >= this.maxBuckets) {
      // The attempt already failed; dropping the counter is preferable to
      // turning a full bucket map into a 500 on the error path.
      return;
    }
    this.buckets.set(key, { count: 1, resetAt: now + windowMs });
  }

  private assertUsableLimit(key: string, limit: number, windowMs: number) {
    if (
      !key ||
      key.length > 512 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      !Number.isFinite(windowMs) ||
      windowMs <= 0
    ) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'rate limit configuration is invalid' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  clientKey(request: RateLimitRequestLike) {
    const socketAddress = request.socket?.remoteAddress ?? request.ip ?? 'unknown';
    if (this.isTrustedProxy(socketAddress)) {
      // Express computes request.ip from the right-hand trusted proxy chain.
      // Re-parsing the first X-Forwarded-For entry here would trust values that
      // an untrusted upstream client can prepend.
      return this.normalizeKey(request.ip ?? socketAddress);
    }

    return this.normalizeKey(socketAddress);
  }

  private isTrustedProxy(address: string) {
    if (this.trustedProxyIps.size === 0) {
      return false;
    }
    return this.trustedProxyIps.has(address) || this.trustedProxyIps.has(address.replace(/^::ffff:/i, ''));
  }

  private normalizeKey(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized.length > 128) {
      return createHash('sha256').update(value).digest('hex');
    }
    return normalized;
  }

  private hashKey(key: string) {
    return createHash('sha256').update(key).digest('hex');
  }

  private async pruneShared() {
    await this.prisma?.$executeRaw(Prisma.sql`
      DELETE FROM "rate_limit_buckets"
      WHERE "reset_at" <= CURRENT_TIMESTAMP
    `);
  }

  private throwRateLimited(message: string): never {
    throw new HttpException(
      { code: 'RATE_LIMITED', message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private prune(now: number) {
    if (this.buckets.size < 256 && this.buckets.size < this.maxBuckets) {
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

}
