import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../src/common/security/secret.util';
import type { PrismaService } from '../src/common/database/prisma.service';
import { RateLimitService } from '../src/common/security/rate-limit.service';
import { AdminMfaService } from '../src/modules/admin/admin-mfa.service';

const databaseUrl = process.env.SYNC_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describeWithPostgres('concurrent PostgreSQL MFA failure limits', () => {
  const previousKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  let prisma: PrismaClient;
  let service: AdminMfaService;
  let encryptedSecret: string;

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = 'test-webhook-secret-encryption-key';
    encryptedSecret = encryptSecret(SECRET_BASE32);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
    service = new AdminMfaService(
      prisma as unknown as PrismaService,
      new ConfigService(),
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      new RateLimitService(new ConfigService(), prisma as unknown as PrismaService),
      { current: () => undefined } as never,
    );
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM rate_limit_buckets');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM rate_limit_buckets');
    await prisma.$disconnect();
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previousKey;
  });

  it('admits no more than the configured number of concurrent wrong codes', async () => {
    const user = {
      id: '00000000-0000-0000-0000-000000000001',
      totpEnabledAt: new Date(),
      totpSecretEncrypted: encryptedSecret,
    };
    const results = await Promise.allSettled(
      Array.from({ length: AdminMfaService.MFA_FAILURE_LIMIT * 4 }, () =>
        service.assertLoginMfa(user, 'wrong'),
      ),
    );
    const codes = results.map((result) =>
      result.status === 'rejected'
        ? (result.reason as { response?: { code?: string } }).response?.code
        : 'OK',
    );

    expect(codes.filter((code) => code === 'MFA_CODE_INVALID')).toHaveLength(
      AdminMfaService.MFA_FAILURE_LIMIT,
    );
    expect(codes.filter((code) => code === 'RATE_LIMITED')).toHaveLength(
      AdminMfaService.MFA_FAILURE_LIMIT * 3,
    );
  });
});
