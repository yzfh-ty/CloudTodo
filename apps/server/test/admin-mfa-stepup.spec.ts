import { AdminMfaService } from '../src/modules/admin/admin-mfa.service';
import { RateLimitService } from '../src/common/security/rate-limit.service';
import { encryptSecret } from '../src/common/security/secret.util';
import { totpCodeAt } from '../src/common/security/totp.util';
import type { AuthenticatedAdmin } from '../src/modules/admin/admin-session.service';

const CURRENT_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const PENDING_SECRET = 'MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U';

const ADMIN: AuthenticatedAdmin = {
  id: 'admin-1',
  email: 'admin@example.com',
  username: 'admin',
  nickname: 'Admin',
  role: 'admin' as never,
  status: 'active' as never,
  forcePasswordChange: false,
};

interface HarnessOptions {
  totpEnabledAt?: Date | null;
  totpSecretEncrypted?: string | null;
  totpPendingSecretEncrypted?: string | null;
  ipAddress?: string | null;
}

function buildHarness(options: HarnessOptions = {}) {
  const userRow = {
    totpEnabledAt: options.totpEnabledAt ?? null,
    totpSecretEncrypted: options.totpSecretEncrypted ?? null,
    totpPendingSecretEncrypted: options.totpPendingSecretEncrypted ?? null,
  };

  const userUpdate = jest.fn().mockResolvedValue(userRow);
  const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(userRow),
      update: userUpdate,
      updateMany: userUpdateMany,
    },
    mfaRecoveryCode: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 8 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  const rateLimitService = new RateLimitService({ get: () => undefined } as never);
  const requestContext = {
    current: () => ({
      ipAddress: options.ipAddress === undefined ? '203.0.113.7' : options.ipAddress,
      requestId: 'req-1',
      sessionId: null,
    }),
  };

  const service = new AdminMfaService(
    prisma as never,
    { get: () => undefined } as never,
    { record: auditRecord } as never,
    rateLimitService,
    requestContext as never,
  );

  return { service, prisma, userUpdate, userUpdateMany, auditRecord, rateLimitService };
}

describe('AdminMfaService TOTP re-enrollment requires the current factor', () => {
  const previousKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  let currentEncrypted: string;
  let pendingEncrypted: string;

  beforeAll(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = 'test-webhook-secret-encryption-key';
    currentEncrypted = encryptSecret(CURRENT_SECRET);
    pendingEncrypted = encryptSecret(PENDING_SECRET);
  });

  afterAll(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previousKey;
  });

  it('allows a first-time enrollment start without a confirmation code', async () => {
    const { service, userUpdate } = buildHarness();
    await expect(service.startEnrollment(ADMIN, undefined)).resolves.toMatchObject({
      code: 'OK',
    });
    expect(userUpdate).toHaveBeenCalled();
  });

  it('refuses to re-bind TOTP without the current factor and writes no pending secret', async () => {
    const { service, userUpdate } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
    });
    await expect(service.startEnrollment(ADMIN, undefined)).rejects.toMatchObject({
      response: { code: 'MFA_CONFIRMATION_REQUIRED' },
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('refuses to re-bind TOTP with a wrong current code', async () => {
    const { service, userUpdate } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
    });
    await expect(service.startEnrollment(ADMIN, '000000')).rejects.toMatchObject({
      response: { code: 'MFA_CODE_INVALID' },
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('allows a re-bind start when the current factor is proven', async () => {
    const { service, userUpdate } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
    });
    const code = totpCodeAt(CURRENT_SECRET, Date.now());
    await expect(service.startEnrollment(ADMIN, code)).resolves.toMatchObject({ code: 'OK' });
    expect(userUpdate).toHaveBeenCalled();
  });

  it('refuses to confirm a re-bind without the current factor', async () => {
    const { service, prisma } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
      totpPendingSecretEncrypted: pendingEncrypted,
    });
    const newCode = totpCodeAt(PENDING_SECRET, Date.now());
    await expect(service.confirmEnrollment(ADMIN, newCode, undefined)).rejects.toMatchObject({
      response: { code: 'MFA_CONFIRMATION_REQUIRED' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('confirms a first-time enrollment with a valid new code', async () => {
    const { service, prisma } = buildHarness({
      totpPendingSecretEncrypted: pendingEncrypted,
    });
    const newCode = totpCodeAt(PENDING_SECRET, Date.now());
    const result = await service.confirmEnrollment(ADMIN, newCode, undefined);
    expect(result).toMatchObject({ code: 'OK' });
    expect(result.data.recovery_codes).toHaveLength(8);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('confirms a re-bind when both the current and the new factor are proven', async () => {
    const { service, prisma } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
      totpPendingSecretEncrypted: pendingEncrypted,
    });
    const currentCode = totpCodeAt(CURRENT_SECRET, Date.now());
    const newCode = totpCodeAt(PENDING_SECRET, Date.now());
    await expect(
      service.confirmEnrollment(ADMIN, newCode, currentCode),
    ).resolves.toMatchObject({ code: 'OK' });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('AdminMfaService rate limits MFA verification failures', () => {
  const previousKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  let currentEncrypted: string;

  beforeAll(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = 'test-webhook-secret-encryption-key';
    currentEncrypted = encryptSecret(CURRENT_SECRET);
  });

  afterAll(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previousKey;
  });

  it('locks out action confirmation after repeated wrong codes', async () => {
    const { service } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
    });

    for (let attempt = 0; attempt < AdminMfaService.MFA_FAILURE_LIMIT; attempt += 1) {
      await expect(service.assertActionConfirmation(ADMIN.id, '000000')).rejects.toMatchObject({
        response: { code: 'MFA_CODE_INVALID' },
      });
    }

    await expect(service.assertActionConfirmation(ADMIN.id, '000000')).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
    // A valid code is refused too while the lockout window is open.
    const code = totpCodeAt(CURRENT_SECRET, Date.now());
    await expect(service.assertActionConfirmation(ADMIN.id, code)).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
  });

  it('locks out enrollment confirmation brute force', async () => {
    const { service } = buildHarness({
      totpPendingSecretEncrypted: encryptSecret(PENDING_SECRET),
    });

    for (let attempt = 0; attempt < AdminMfaService.MFA_FAILURE_LIMIT; attempt += 1) {
      await expect(service.confirmEnrollment(ADMIN, '000000', undefined)).rejects.toMatchObject({
        response: { code: 'MFA_CODE_INVALID' },
      });
    }

    await expect(service.confirmEnrollment(ADMIN, '000000', undefined)).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
  });

  it('locks out login MFA brute force from the same address', async () => {
    const { service } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
    });
    const user = {
      id: ADMIN.id,
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
    };

    for (let attempt = 0; attempt < AdminMfaService.MFA_FAILURE_LIMIT; attempt += 1) {
      await expect(service.assertLoginMfa(user, '000000')).rejects.toMatchObject({
        response: { code: 'MFA_CODE_INVALID' },
      });
    }

    await expect(service.assertLoginMfa(user, '000000')).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
  });

  it('keeps a different admin usable when one admin is locked out by user key', async () => {
    // The per-admin key must not be the only dimension: with no client address
    // in context, a lockout stays scoped to the account it was earned on.
    const { service } = buildHarness({
      totpEnabledAt: new Date(),
      totpSecretEncrypted: currentEncrypted,
      ipAddress: null,
    });

    for (let attempt = 0; attempt < AdminMfaService.MFA_FAILURE_LIMIT; attempt += 1) {
      await expect(service.assertActionConfirmation('admin-1', '000000')).rejects.toMatchObject({
        response: { code: 'MFA_CODE_INVALID' },
      });
    }

    await expect(service.assertActionConfirmation('admin-1', '000000')).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
    await expect(service.assertActionConfirmation('admin-2', '000000')).rejects.toMatchObject({
      response: { code: 'MFA_CODE_INVALID' },
    });
  });
});
