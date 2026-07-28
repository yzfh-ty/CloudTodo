import { AdminService } from '../src/modules/admin/admin.service';
import { scryptSync } from 'node:crypto';
import type { AuthenticatedAdmin } from '../src/modules/admin/admin-session.service';

const ADMIN: AuthenticatedAdmin = {
  id: 'admin-1',
  email: 'admin@corp.com',
  username: 'admin',
  nickname: 'Admin',
  role: 'admin' as never,
  status: 'active' as never,
  forcePasswordChange: false,
};

describe('AdminService.login normalizes the account identifier', () => {
  const password = 'CorrectHorse#12345';
  const salt = '00112233445566778899aabbccddeeff';
  const adminRow = {
    id: 'admin-1',
    email: 'admin@corp.com',
    username: 'Admin',
    nickname: 'Admin',
    role: 'admin',
    status: 'active',
    forcePasswordChange: false,
    lastLoginAt: new Date('2026-07-01T00:00:00.000Z'),
    passwordChangedAt: null,
    sessionRevokedAt: null,
    passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`,
    totpEnabledAt: null,
    totpSecretEncrypted: null,
    receivedPasswordResetTokens: [],
  };

  function buildService() {
    const findFirst = jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        where.email === adminRow.email || where.username === adminRow.username
          ? adminRow
          : null,
      );
    });
    const service = new AdminService(
      {
        user: {
          findFirst,
          update: jest.fn().mockResolvedValue(adminRow),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
          typeof fn === 'function'
            ? fn({ user: { update: jest.fn().mockResolvedValue(adminRow) } })
            : adminRow,
        ),
      } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { current: () => undefined } as never,
      { assertLoginMfa: jest.fn().mockResolvedValue(undefined) } as never,
    );
    return { service, findFirst };
  }

  it('queries the email column with a lowercased account', async () => {
    // Every writer stores the address lowercased, so an admin who types their
    // address the way it appears on a business card cannot sign in otherwise.
    const { service, findFirst } = buildService();
    await service.login({ account: 'Admin@Corp.com', password } as never);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'admin@corp.com' },
      }),
    );
  });

  it('lets an admin log in with a mixed-case email address', async () => {
    const { service } = buildService();
    await expect(
      service.login({ account: '  ADMIN@CORP.COM ', password } as never),
    ).resolves.toMatchObject({ code: 'OK' });
  });

  it('leaves the username candidate untouched', async () => {
    const { service } = buildService();
    await expect(
      service.login({ account: 'Admin', password } as never),
    ).resolves.toMatchObject({ code: 'OK' });
  });
});

describe('AdminService.updateUser normalizes the email address', () => {
  const target = {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    nickname: 'Alice',
    timezone: 'Asia/Shanghai',
  };

  function buildService(conflictingUser: { id: string } | null = null) {
    const update = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ ...target, ...data }),
    );
    const findFirst = jest.fn().mockResolvedValue(conflictingUser);
    const service = new AdminService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue(target),
          findFirst,
          update,
        },
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: unknown) => unknown) =>
            fn({ user: { update }, adminOperationLog: { create: jest.fn() } }),
          ),
      } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { current: () => undefined } as never,
      {} as never,
    );
    return { service, update, findFirst };
  }

  it('stores a mixed-case email in lowercase', async () => {
    const { service, update } = buildService();
    await service.updateUser(ADMIN, 'user-1', {
      email: 'Alice.New@Example.COM',
      reason: 'normalization test',
    } as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: 'alice.new@example.com' } }),
    );
  });

  it('checks for duplicates against the normalized address', async () => {
    const { service, findFirst } = buildService({ id: 'user-2' });
    await expect(
      service.updateUser(ADMIN, 'user-1', {
        email: 'BOB@Example.com',
        reason: 'duplicate test',
      } as never),
    ).rejects.toMatchObject({ response: { message: 'email is already in use' } });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ email: 'bob@example.com' }, { username: 'bob@example.com' }],
        }),
      }),
    );
  });

  it('treats a case-only change to the current address as a no-op', async () => {
    const { service, update } = buildService();
    await expect(
      service.updateUser(ADMIN, 'user-1', {
        email: 'ALICE@EXAMPLE.COM',
        reason: 'case only',
      } as never),
    ).rejects.toMatchObject({ response: { message: 'no user fields to update' } });
    expect(update).not.toHaveBeenCalled();
  });
});
