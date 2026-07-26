import type { Prisma } from '@prisma/client';
import { createAuditLogTx } from '../src/modules/admin/admin-security.util';
import type { SecurityRequestContextService } from '../src/common/security/security-request-context.service';

describe('admin operation log metadata sanitization', () => {
  it('redacts secret-like keys and appends the request context', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { adminOperationLog: { create } } as unknown as Prisma.TransactionClient;
    const requestContext = {
      current: () => ({
        ipAddress: '203.0.113.10',
        sessionId: 'hashed-session',
        requestId: 'req-1',
      }),
    } as unknown as SecurityRequestContextService;

    await createAuditLogTx(tx, requestContext, {
      adminUserId: 'admin-1',
      targetUserId: 'user-1',
      action: 'reset_user_password' as never,
      reason: 'test',
      result: 'success' as never,
      metadata: {
        mode: 'temporary_password',
        temporary_password: 'Temp#abc123',
        reset_token: 'super-secret-token',
        totp_code: '123456',
        recovery_code: 'AAAA-BBBB',
      },
    });

    const written = create.mock.calls[0][0].data.metadata;
    expect(written).toMatchObject({
      mode: 'temporary_password',
      temporary_password: '[REDACTED]',
      reset_token: '[REDACTED]',
      totp_code: '[REDACTED]',
      recovery_code: '[REDACTED]',
      session_id: 'hashed-session',
      request_id: 'req-1',
    });
  });

  it('does not mutate the caller metadata object', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { adminOperationLog: { create } } as unknown as Prisma.TransactionClient;
    const requestContext = {
      current: () => ({ sessionId: 'hashed-session' }),
    } as unknown as SecurityRequestContextService;

    const metadata = { reset_token: 'secret' };
    await createAuditLogTx(tx, requestContext, {
      adminUserId: 'admin-1',
      action: 'reset_user_password' as never,
      reason: 'test',
      result: 'success' as never,
      metadata,
    });

    expect(metadata).toEqual({ reset_token: 'secret' });
  });
});
