import { UnauthorizedException } from '@nestjs/common';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { SecurityAuditService } from '../src/common/security/security-audit.service';
import { AuthService } from '../src/modules/auth/auth.service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('refresh token logout PostgreSQL behavior', () => {
  const emailPrefix = 'auth-logout-test-';
  let prisma: PrismaClient;
  let service: AuthService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
    service = new AuthService(
      prisma as unknown as PrismaService,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as SecurityAuditService,
    );
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('atomically and idempotently logs out a fresh refresh token', async () => {
    const session = await createSession('fresh');

    await expect(service.logout(session.refreshToken)).resolves.toEqual({
      code: 'OK',
      message: 'success',
      data: null,
    });

    const firstState = await loadSessionState(session.userId);
    expect(firstState.sessionRevokedAt).not.toBeNull();
    expect(firstState.authRefreshTokens).toEqual([
      expect.objectContaining({
        tokenHash: hashToken(session.refreshToken),
        revokedAt: expect.any(Date),
        revokeReason: 'logout',
      }),
    ]);

    await expect(service.logout(session.refreshToken)).resolves.toEqual({
      code: 'OK',
      message: 'success',
      data: null,
    });
    const secondState = await loadSessionState(session.userId);
    expect(secondState.sessionRevokedAt).toEqual(firstState.sessionRevokedAt);
    expect(secondState.authRefreshTokens).toEqual(firstState.authRefreshTokens);
  });

  it('uses a rotated predecessor to revoke its current successor', async () => {
    const session = await createSession('rotated');
    const rotation = await service.refresh(session.refreshToken);

    await service.logout(session.refreshToken);

    const state = await loadSessionState(session.userId);
    expect(state.sessionRevokedAt).not.toBeNull();
    expect(state.authRefreshTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tokenHash: hashToken(session.refreshToken),
          revokeReason: 'rotated',
        }),
        expect.objectContaining({
          tokenHash: hashToken(rotation.data.refreshToken),
          revokedAt: expect.any(Date),
          revokeReason: 'logout',
        }),
      ]),
    );
    expect(state.authRefreshTokens.every((token) => token.revokedAt !== null)).toBe(true);
    await expect(service.refresh(rotation.data.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('leaves every account unchanged for an unknown refresh token', async () => {
    const session = await createSession('unknown');
    const before = await loadSessionState(session.userId);

    await expect(service.logout('not-a-real-refresh-token')).resolves.toEqual({
      code: 'OK',
      message: 'success',
      data: null,
    });

    expect(await loadSessionState(session.userId)).toEqual(before);
  });

  it('leaves no usable successor after refresh races with logout', async () => {
    const session = await createSession('race');
    const [refreshResult, logoutResult] = await Promise.allSettled([
      service.refresh(session.refreshToken),
      service.logout(session.refreshToken),
    ]);

    expect(logoutResult.status).toBe('fulfilled');
    const state = await loadSessionState(session.userId);
    expect(state.sessionRevokedAt).not.toBeNull();
    expect(state.authRefreshTokens).not.toHaveLength(0);
    expect(state.authRefreshTokens.every((token) => token.revokedAt !== null)).toBe(true);

    if (refreshResult.status === 'fulfilled') {
      const successor = refreshResult.value.data.refreshToken;
      expect(state.authRefreshTokens).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tokenHash: hashToken(successor),
            revokedAt: expect.any(Date),
            revokeReason: 'logout',
          }),
        ]),
      );
      await expect(service.refresh(successor)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    } else {
      expect(refreshResult.reason).toBeInstanceOf(UnauthorizedException);
    }
  });

  async function createSession(label: string) {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `${emailPrefix}${label}-${suffix}@example.test`,
        username: `auth_logout_${label}_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Auth Logout Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });
    const issued = await service.issueRefreshToken(user.id, user.createdAt);
    return { userId: user.id, refreshToken: issued.refreshToken };
  }

  function loadSessionState(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        sessionRevokedAt: true,
        authRefreshTokens: {
          orderBy: { createdAt: 'asc' },
          select: {
            tokenHash: true,
            revokedAt: true,
            revokeReason: true,
          },
        },
      },
    });
  }

  function hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
});
