import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../src/common/database/prisma.service';
import { RateLimitService } from '../src/common/security/rate-limit.service';

describe('shared rate-limit database clock', () => {
  const databaseNow = new Date('2026-07-28T00:00:00.000Z');
  const appNow = new Date('2036-07-28T00:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(appNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps an active database bucket locked when the application clock is ahead', async () => {
    const prisma = {
      rateLimitBucket: {
        findUnique: jest.fn().mockResolvedValue({
          count: 2,
          resetAt: new Date(databaseNow.getTime() + 60_000),
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 2 }]),
    } as unknown as PrismaService;
    const service = new RateLimitService(new ConfigService(), prisma);

    await expect(service.assertNotLockedShared('mfa:user:clock-skew', 2, 60_000))
      .rejects.toMatchObject({ status: 429 });
  });

  it('does not prune an active database bucket using the application clock', async () => {
    let bucketExists = true;
    const prisma = {
      rateLimitBucket: {
        deleteMany: jest.fn(async ({ where }: { where: { resetAt: { lte: Date } } }) => {
          if (where.resetAt.lte >= new Date(databaseNow.getTime() + 60_000)) {
            bucketExists = false;
          }
          return { count: bucketExists ? 0 : 1 };
        }),
      },
      $executeRaw: jest.fn(async () => ({ count: 0 })),
      $queryRaw: jest.fn(async () => (bucketExists ? [] : [{ count: 1 }])),
    } as unknown as PrismaService;
    const service = new RateLimitService(new ConfigService(), prisma);

    await expect(service.assertAllowedShared('auth:clock-skew', 1, 60_000))
      .rejects.toMatchObject({ status: 429 });
  });
});
