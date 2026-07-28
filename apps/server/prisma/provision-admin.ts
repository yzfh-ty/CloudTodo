import 'dotenv/config';
import {
  PasswordResetMode,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { isStrongSecret } from '../src/common/config/production-guard';
import { hashPassword } from '../src/common/security/password.util';
import { hashResetToken } from '../src/common/security/token-hash.util';

const prisma = new PrismaClient();

async function main() {
  const email = required('ADMIN_INITIAL_EMAIL').trim().toLowerCase();
  const username = required('ADMIN_INITIAL_USERNAME').trim();
  const password = required('ADMIN_INITIAL_PASSWORD');
  const nickname = process.env.ADMIN_INITIAL_NICKNAME?.trim() || username;
  const timezone = process.env.ADMIN_INITIAL_TIMEZONE?.trim() || 'UTC';

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('ADMIN_INITIAL_EMAIL must be a valid email address');
  }
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username)) {
    throw new Error('ADMIN_INITIAL_USERNAME must be 3-64 safe characters');
  }
  if (!isStrongSecret(password)) {
    throw new Error('ADMIN_INITIAL_PASSWORD must be a strong 32+ character secret');
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });
  if (existing) {
    throw new Error('An account already uses the requested administrator identity');
  }

  const provisionedAt = new Date();
  const expiresAt = new Date(provisionedAt.getTime() + 2 * 60 * 60 * 1000);
  const passwordHash = await hashPassword(password);
  const trackingTokenHash = hashResetToken(randomBytes(24).toString('base64url'));
  const admin = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        username,
        passwordHash,
        nickname,
        timezone,
        role: UserRole.admin,
        status: UserStatus.active,
        passwordChangedAt: provisionedAt,
        sessionRevokedAt: provisionedAt,
        forcePasswordChange: true,
      },
      select: { id: true, email: true, username: true, createdAt: true },
    });
    await tx.authPasswordResetToken.create({
      data: {
        userId: created.id,
        tokenHash: trackingTokenHash,
        mode: PasswordResetMode.temporary_password,
        temporaryPasswordHash: passwordHash,
        reason: 'initial administrator provisioning',
        expiresAt,
      },
    });
    return created;
  });

  process.stdout.write(
    `${JSON.stringify({
      message: 'Administrator provisioned; password change required on first login',
      admin,
      temporaryPasswordExpiresAt: expiresAt,
    })}\n`,
  );
}

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Provisioning failed'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
