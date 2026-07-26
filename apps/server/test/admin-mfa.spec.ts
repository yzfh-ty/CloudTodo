import { UnauthorizedException } from '@nestjs/common';
import { AdminMfaService } from '../src/modules/admin/admin-mfa.service';
import { encryptSecret } from '../src/common/security/secret.util';
import { totpCodeAt } from '../src/common/security/totp.util';

const SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('AdminMfaService login verification', () => {
  const previousKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  let encryptedSecret: string;
  let recoveryUpdateMany: jest.Mock;
  let userUpdateMany: jest.Mock;
  let auditRecord: jest.Mock;
  let service: AdminMfaService;

  beforeAll(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = 'test-webhook-secret-encryption-key';
    encryptedSecret = encryptSecret(SECRET_BASE32);
  });

  afterAll(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previousKey;
  });

  beforeEach(() => {
    recoveryUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    auditRecord = jest.fn().mockResolvedValue(undefined);
    service = new AdminMfaService(
      {
        mfaRecoveryCode: { updateMany: recoveryUpdateMany },
        user: { updateMany: userUpdateMany },
      } as never,
      { get: () => undefined } as never,
      { record: auditRecord } as never,
    );
  });

  it('passes through when TOTP is not enabled', async () => {
    await expect(
      service.assertLoginMfa(
        { id: 'u1', totpEnabledAt: null, totpSecretEncrypted: null },
        undefined,
      ),
    ).resolves.toBeUndefined();
  });

  it('requires a code once TOTP is enabled', async () => {
    await expect(
      service.assertLoginMfa(
        { id: 'u1', totpEnabledAt: new Date(), totpSecretEncrypted: encryptedSecret },
        undefined,
      ),
    ).rejects.toMatchObject({
      response: { code: 'MFA_REQUIRED' },
    });
  });

  it('accepts a valid current TOTP code and claims its time step', async () => {
    const code = totpCodeAt(SECRET_BASE32, Date.now());
    await expect(
      service.assertLoginMfa(
        { id: 'u1', totpEnabledAt: new Date(), totpSecretEncrypted: encryptedSecret },
        code,
      ),
    ).resolves.toBeUndefined();
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u1' }),
        data: { totpLastUsedStep: expect.any(BigInt) },
      }),
    );
  });

  it('rejects a replayed TOTP code once its step has been used', async () => {
    // The conditional update matches nothing when the step was already
    // claimed, which is exactly what a replay inside the window looks like.
    userUpdateMany.mockResolvedValueOnce({ count: 0 });
    const code = totpCodeAt(SECRET_BASE32, Date.now());
    await expect(
      service.assertLoginMfa(
        { id: 'u1', totpEnabledAt: new Date(), totpSecretEncrypted: encryptedSecret },
        code,
      ),
    ).rejects.toMatchObject({
      response: { code: 'MFA_CODE_INVALID' },
    });
  });

  it('rejects an invalid code and records an audit event', async () => {
    await expect(
      service.assertLoginMfa(
        { id: 'u1', totpEnabledAt: new Date(), totpSecretEncrypted: encryptedSecret },
        '000000',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin_mfa_failure',
        result: 'failure',
        targetUserId: 'u1',
      }),
    );
  });

  it('consumes a recovery code atomically exactly once', async () => {
    recoveryUpdateMany.mockResolvedValueOnce({ count: 1 });
    await expect(
      service.assertLoginMfa(
        { id: 'u1', totpEnabledAt: new Date(), totpSecretEncrypted: encryptedSecret },
        'AAAA-BBBB-CCCC-DDDD',
      ),
    ).resolves.toBeUndefined();
    expect(recoveryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', consumedAt: null }),
        data: { consumedAt: expect.any(Date) },
      }),
    );

    // Second use: updateMany matches nothing, so the login is rejected.
    await expect(
      service.assertLoginMfa(
        { id: 'u1', totpEnabledAt: new Date(), totpSecretEncrypted: encryptedSecret },
        'AAAA-BBBB-CCCC-DDDD',
      ),
    ).rejects.toMatchObject({
      response: { code: 'MFA_CODE_INVALID' },
    });
  });
});
