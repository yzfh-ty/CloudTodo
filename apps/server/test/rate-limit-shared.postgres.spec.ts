import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';
import { RateLimitService } from '../src/common/security/rate-limit.service';

const databaseUrl = process.env.SYNC_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('shared PostgreSQL rate limits', () => {
  let firstClient: PrismaClient;
  let secondClient: PrismaClient;
  let first: RateLimitService;
  let second: RateLimitService;

  beforeAll(async () => {
    firstClient = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    secondClient = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);
    const config = new ConfigService();
    first = new RateLimitService(config, firstClient as unknown as PrismaService);
    second = new RateLimitService(config, secondClient as unknown as PrismaService);
  });

  beforeEach(async () => {
    await firstClient.$executeRawUnsafe('DELETE FROM rate_limit_buckets');
  });

  afterAll(async () => {
    await firstClient.$executeRawUnsafe('DELETE FROM rate_limit_buckets');
    await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shares a charged authentication quota across server instances', async () => {
    await first.assertAllowedShared('auth:login:ip:203.0.113.4', 1, 60_000);

    await expect(
      second.assertAllowedShared('auth:login:ip:203.0.113.4', 1, 60_000),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('shares MFA failure lockouts across server instances', async () => {
    const key = 'admin:mfa:user:00000000-0000-0000-0000-000000000001';
    await first.registerFailureShared(key, 60_000);
    await second.registerFailureShared(key, 60_000);

    await expect(first.assertNotLockedShared(key, 2, 60_000)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('uses the database clock when the application clock is ahead', async () => {
    const key = 'admin:mfa:user:clock-skew';
    await first.registerFailureShared(key, 60_000);
    jest.useFakeTimers().setSystemTime(new Date('2036-07-28T00:00:00.000Z'));

    await expect(first.assertNotLockedShared(key, 1, 60_000)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('does not clean up active buckets using an ahead application clock', async () => {
    const key = 'auth:cleanup-clock-skew';
    await first.assertAllowedShared(key, 1, 60_000);
    jest.useFakeTimers().setSystemTime(new Date('2036-07-28T00:00:00.000Z'));

    await expect(second.assertAllowedShared(key, 1, 60_000)).rejects.toMatchObject({
      status: 429,
    });
  });
});
