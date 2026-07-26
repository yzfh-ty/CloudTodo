import { UnauthorizedException } from '@nestjs/common';
import { PasswordResetMode, UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '../src/common/security/password.util';
import { AdminService } from '../src/modules/admin/admin.service';
import type { AuthenticatedAdmin } from '../src/modules/admin/admin-session.service';
import {
  AdminResetPasswordMode,
  type AdminResetPasswordDto,
} from '../src/modules/admin/dto/admin-reset-password.dto';
import { AuthService } from '../src/modules/auth/auth.service';

interface TestUser {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  timezone: string;
  forcePasswordChange: boolean;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  sessionRevokedAt: Date | null;
  passwordHash: string;
}

interface TestResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  mode: PasswordResetMode;
  temporaryPasswordHash: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

function createStatefulPrisma(user: TestUser) {
  const resetTokens: TestResetToken[] = [];

  const transactionClient = {
    user: {
      findFirst: jest.fn(async () => ({
        ...user,
        receivedPasswordResetTokens: resetTokens
          .filter(
            (token) =>
              token.mode === PasswordResetMode.temporary_password &&
              token.consumedAt === null,
          )
          .map((token) => ({
            expiresAt: token.expiresAt,
            temporaryPasswordHash: token.temporaryPasswordHash,
          })),
      })),
      update: jest.fn(async ({ data }: { data: Partial<TestUser> }) => {
        Object.assign(user, data);
        return { ...user };
      }),
      updateMany: jest.fn(
        async ({ data }: { data: { lastLoginAt?: Date } }) => {
          Object.assign(user, data);
          return { count: 1 };
        },
      ),
    },
    authRefreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authPasswordResetToken: {
      findFirst: jest.fn(
        async ({ where }: { where: { tokenHash: string } }) => {
          const token = resetTokens.find(
            (candidate) =>
              candidate.tokenHash === where.tokenHash &&
              candidate.mode === PasswordResetMode.reset_token &&
              candidate.consumedAt === null &&
              candidate.expiresAt > new Date(),
          );
          return token ? { id: token.id, userId: token.userId } : null;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id?: string | { not: string };
            userId?: string;
            consumedAt?: null;
          };
          data: { consumedAt: Date };
        }) => {
          const matches = resetTokens.filter((token) => {
            const idMatches =
              typeof where.id === 'string'
                ? token.id === where.id
                : where.id
                  ? token.id !== where.id.not
                  : true;
            return (
              idMatches &&
              (where.userId === undefined || token.userId === where.userId) &&
              (where.consumedAt !== null || token.consumedAt === null)
            );
          });
          matches.forEach((token) => {
            token.consumedAt = data.consumedAt;
          });
          return { count: matches.length };
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: Omit<TestResetToken, 'id' | 'consumedAt'>;
        }) => {
          const token = {
            ...data,
            id: `reset-${resetTokens.length + 1}`,
            consumedAt: null,
          };
          resetTokens.push(token);
          return token;
        },
      ),
    },
    adminOperationLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn(async () => [
      {
        id: user.id,
        status: user.status,
        forcePasswordChange: user.forcePasswordChange,
        passwordChangedAt: user.passwordChangedAt,
        sessionRevokedAt: user.sessionRevokedAt,
      },
    ]),
  };
  const prisma = {
    ...transactionClient,
    $transaction: jest.fn(
      async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };

  return { prisma, resetTokens };
}

describe('admin reset-token password invalidation', () => {
  const previousResetSecret = process.env.PASSWORD_RESET_TOKEN_SECRET;

  beforeAll(() => {
    process.env.PASSWORD_RESET_TOKEN_SECRET = 'admin-reset-security-test-secret';
  });

  afterAll(() => {
    if (previousResetSecret === undefined) {
      delete process.env.PASSWORD_RESET_TOKEN_SECRET;
    } else {
      process.env.PASSWORD_RESET_TOKEN_SECRET = previousResetSecret;
    }
  });

  it('blocks the old password until the reset token sets a new password', async () => {
    const oldPassword = 'OldPassword#1';
    const newPassword = 'NewPassword#2';
    const user: TestUser = {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'user@example.com',
      username: 'user',
      nickname: 'User',
      role: UserRole.user,
      status: UserStatus.active,
      timezone: 'Asia/Shanghai',
      forcePasswordChange: false,
      lastLoginAt: null,
      passwordChangedAt: new Date('2026-01-01T00:00:00.000Z'),
      sessionRevokedAt: null,
      passwordHash: hashPassword(oldPassword),
    };
    const { prisma, resetTokens } = createStatefulPrisma(user);
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const requestContext = { current: jest.fn().mockReturnValue(undefined) };
    const adminService = new AdminService(
      prisma as never,
      audit as never,
      requestContext as never,
      { assertLoginMfa: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const authService = new AuthService(prisma as never, audit as never);
    const admin: AuthenticatedAdmin = {
      id: '20000000-0000-4000-8000-000000000002',
      email: 'admin@example.com',
      username: 'admin',
      nickname: 'Admin',
      role: UserRole.admin,
      status: UserStatus.active,
      forcePasswordChange: false,
    };
    const dto: AdminResetPasswordDto = {
      mode: AdminResetPasswordMode.RESET_TOKEN,
      reason: 'suspected credential exposure',
    };

    const issued = await adminService.resetPassword(admin, user.id, dto);

    expect(user.forcePasswordChange).toBe(true);
    expect(user.sessionRevokedAt).toBeInstanceOf(Date);
    expect(resetTokens).toHaveLength(1);
    expect(resetTokens[0].mode).toBe(PasswordResetMode.reset_token);
    await expect(
      authService.login({ account: user.email, password: oldPassword }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEMPORARY_PASSWORD_EXPIRED' }),
    });

    const resetToken = issued.data.reset_token;
    expect(resetToken).toEqual(expect.any(String));
    if (!resetToken) {
      throw new Error('reset token was not returned');
    }
    await authService.confirmPasswordReset({
      token: resetToken,
      new_password: newPassword,
      confirm_password: newPassword,
    });

    expect(user.forcePasswordChange).toBe(false);
    expect(resetTokens[0].consumedAt).toBeInstanceOf(Date);
    await expect(
      authService.login({ account: user.email, password: oldPassword }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      authService.login({ account: user.email, password: newPassword }),
    ).resolves.toMatchObject({
      data: { user: { id: user.id, forcePasswordChange: false } },
    });
  });
});
