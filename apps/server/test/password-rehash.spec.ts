import { scryptSync } from 'node:crypto';
import { AuthService } from '../src/modules/auth/auth.service';

describe('password hash migration on login', () => {
  it('upgrades a valid legacy scrypt hash to Argon2id atomically', async () => {
    const password = 'LegacyPassword#123';
    const salt = '00112233445566778899aabbccddeeff';
    const legacyHash =
      `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      username: 'legacy-user',
      nickname: 'Legacy User',
      role: 'user',
      status: 'active',
      timezone: 'UTC',
      forcePasswordChange: false,
      lastLoginAt: null,
      passwordChangedAt: null,
      sessionRevokedAt: null,
      passwordHash: legacyHash,
      receivedPasswordResetTokens: [],
    };
    const service = new AuthService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue(user),
          updateMany,
        },
      } as never,
      { record: jest.fn() } as never,
    );

    await service.login({ account: user.email, password });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ passwordHash: legacyHash }),
        data: expect.objectContaining({
          passwordHash: expect.stringMatching(/^\$argon2id\$/),
        }),
      }),
    );
  });
});
