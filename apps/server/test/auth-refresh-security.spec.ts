import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { SecurityAuditService } from '../src/common/security/security-audit.service';
import { AuthService } from '../src/modules/auth/auth.service';

describe('refresh token family security', () => {
  it('revokes the current family when an expired rotated token is reused', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: userId,
          status: UserStatus.active,
          forcePasswordChange: false,
          passwordChangedAt: null,
          sessionRevokedAt: null,
        },
      ]),
      user: { update: jest.fn().mockResolvedValue({ id: userId }) },
      authRefreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      authRefreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: '00000000-0000-0000-0000-000000000002',
          userId,
          tokenHash: 'hash',
          createdAt,
          expiresAt: new Date('2026-01-02T00:00:00.000Z'),
          revokedAt: new Date('2026-01-01T01:00:00.000Z'),
          revokeReason: 'rotated',
          user: {
            id: userId,
            email: 'user@example.test',
            username: 'user',
            nickname: 'User',
            role: UserRole.user,
            status: UserStatus.active,
            timezone: 'UTC',
            forcePasswordChange: false,
            lastLoginAt: createdAt,
            passwordChangedAt: null,
            sessionRevokedAt: null,
          },
        }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      audit as unknown as SecurityAuditService,
    );

    await expect(service.refresh('expired-rotated-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { sessionRevokedAt: expect.any(Date) },
    });
    expect(tx.authRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokeReason: 'refresh_token_reuse_detected',
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refresh_token_reuse',
        result: 'blocked',
        targetUserId: userId,
      }),
    );
  });
});
