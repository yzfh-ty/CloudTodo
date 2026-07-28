import { AuthService } from '../src/modules/auth/auth.service';
import { AdminService } from '../src/modules/admin/admin.service';
import type { AuthenticatedAdmin } from '../src/modules/admin/admin-session.service';

const ADMIN: AuthenticatedAdmin = {
  id: 'admin-1',
  email: 'admin@example.com',
  username: 'admin',
  nickname: 'Admin',
  role: 'admin' as never,
  status: 'active' as never,
  forcePasswordChange: false,
};

describe('account identifier ambiguity', () => {
  it('queries exactly one login field based on the account shape', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new AuthService(
      { user: { findFirst } } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.login({ account: 'Victim@Example.com', password: 'wrong' }),
    ).rejects.toBeDefined();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'victim@example.com' } }),
    );

    findFirst.mockClear();
    await expect(
      service.login({ account: 'VictimUser', password: 'wrong' }),
    ).rejects.toBeDefined();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'VictimUser' } }),
    );
  });

  it('rejects an email-shaped username during self-registration', async () => {
    const service = new AuthService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        $transaction: jest.fn().mockResolvedValue([null, null]),
      } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.register({
        email: 'attacker@example.com',
        username: 'victim@example.com',
        password: 'CorrectHorse#12345',
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', message: 'username must not contain @' },
    });
  });

  it('rejects email-shaped usernames before an admin creates a user', async () => {
    const findFirst = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(
        where.OR?.some(
          (candidate: Record<string, string>) =>
            candidate.email === 'victim@example.com',
        )
          ? { id: 'victim-1' }
          : null,
      ),
    );
    const service = buildAdminService(null, { findFirst });

    await expect(
      service.createUser(ADMIN, {
        email: 'new@example.com',
        username: 'victim@example.com',
        password: 'CorrectHorse#12345',
        reason: 'test',
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('checks an updated email against existing usernames', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'conflict-1' });
    const service = buildAdminService(null, {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        nickname: 'Alice',
        timezone: 'UTC',
      }),
      findFirst,
    });

    await expect(
      service.updateUser(ADMIN, 'user-1', {
        email: 'legacy@example.com',
        reason: 'test',
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', message: 'email is already in use' },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ email: 'legacy@example.com' }, { username: 'legacy@example.com' }],
        }),
      }),
    );
  });
});

function buildAdminService(
  conflict: { id: string } | null,
  userOverrides: Record<string, unknown> = {},
) {
  const findFirst =
    userOverrides.findFirst ?? jest.fn().mockResolvedValue(conflict);
  return new AdminService(
    {
      user: {
        ...userOverrides,
        findFirst,
      },
      $transaction: jest.fn().mockImplementation((input: unknown) =>
        Array.isArray(input) ? Promise.all(input) : Promise.resolve(null),
      ),
    } as never,
    { record: jest.fn() } as never,
    { current: jest.fn() } as never,
    {} as never,
  );
}
