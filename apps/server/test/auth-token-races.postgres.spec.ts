import { UnauthorizedException } from '@nestjs/common';
import { PasswordResetMode, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { SecurityAuditService } from '../src/common/security/security-audit.service';
import { hashResetToken } from '../src/common/security/token-hash.util';
import { AuthService } from '../src/modules/auth/auth.service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('token consumption races on PostgreSQL', () => {
  const emailPrefix = 'auth-race-test-';
  const previousResetSecret = process.env.PASSWORD_RESET_TOKEN_SECRET;
  let prisma: PrismaClient;
  let service: AuthService;

  beforeAll(async () => {
    process.env.PASSWORD_RESET_TOKEN_SECRET ??= 'race-test-reset-token-secret';
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
    process.env.PASSWORD_RESET_TOKEN_SECRET = previousResetSecret;
    await prisma.$disconnect();
  });

  it('lets exactly one of two concurrent reset confirmations succeed', async () => {
    const user = await createUser('reset');
    const resetToken = randomUUID();
    await prisma.authPasswordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(resetToken),
        mode: PasswordResetMode.reset_token,
        reason: 'race test',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const confirm = () =>
      service.confirmPasswordReset({
        token: resetToken,
        new_password: 'RaceProof#12345',
        confirm_password: 'RaceProof#12345',
      });
    const results = await Promise.allSettled([confirm(), confirm()]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({
          response: { code: 'PASSWORD_RESET_TOKEN_INVALID' },
        });
      }
    }

    const tokens = await prisma.authPasswordResetToken.findMany({
      where: { userId: user.id },
      select: { consumedAt: true },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].consumedAt).not.toBeNull();
  });

  it('never lets two concurrent refreshes of one token both mint usable successors', async () => {
    const user = await createUser('refresh');
    const issued = await service.issueRefreshToken(user.id, user.createdAt);

    const results = await Promise.allSettled([
      service.refresh(issued.refreshToken),
      service.refresh(issued.refreshToken),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled.length).toBeLessThanOrEqual(1);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(UnauthorizedException);
      }
    }

    // Whatever the interleaving, the predecessor must be spent: replaying it
    // is treated as reuse and must not produce another usable successor.
    await expect(service.refresh(issued.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const state = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        sessionRevokedAt: true,
        authRefreshTokens: { select: { revokedAt: true } },
      },
    });
    // The reuse attempt above revokes the whole token family.
    expect(state.sessionRevokedAt).not.toBeNull();
    expect(
      state.authRefreshTokens.every((token) => token.revokedAt !== null),
    ).toBe(true);
  });

  async function createUser(label: string) {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return prisma.user.create({
      data: {
        email: `${emailPrefix}${label}-${suffix}@example.test`,
        username: `auth_race_${label}_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Auth Race Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });
  }
});
