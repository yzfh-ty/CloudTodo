import 'dotenv/config';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '../src/common/security/password.util';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed is disabled in production; use a one-time provisioning command.');
  }

  // 初始化管理员的用户名
  // 初始化管理员的邮箱
  // 初始化管理员的密码
  // 初始化管理员的显示昵称
  // 初始化管理员的默认时区
  const username = process.env.ADMIN_SEED_USERNAME ?? 'admin';
  const email = process.env.ADMIN_SEED_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'admin123456';
  const nickname = process.env.ADMIN_SEED_NICKNAME ?? 'System Admin';
  const timezone = process.env.ADMIN_SEED_TIMEZONE ?? 'Asia/Shanghai';
  assertSafeSeedPassword('ADMIN_SEED_PASSWORD', password);

  // 是否创建演示普通用户
  // 演示普通用户邮箱
  // 演示普通用户用户名
  // 演示普通用户密码
  // 演示普通用户显示昵称
  // 演示普通用户默认时区
  const demoUserEnabled = process.env.DEMO_USER_ENABLED === 'true';
  const demoEmail = process.env.DEMO_USER_EMAIL ?? 'demo@example.com';
  const demoUsername = process.env.DEMO_USER_USERNAME ?? 'demo';
  const demoPassword = process.env.DEMO_USER_PASSWORD ?? 'demo123456';
  const demoNickname = process.env.DEMO_USER_NICKNAME ?? 'Demo User';
  const demoTimezone = process.env.DEMO_USER_TIMEZONE ?? 'Asia/Shanghai';
  if (demoUserEnabled) {
    assertSafeSeedPassword('DEMO_USER_PASSWORD', demoPassword);
  }

  // Seeding is intentionally create-only. Re-running a seed must never
  // replace an administrator's password or silently re-enable an account.
  const existingAdmin = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      status: true,
    },
  });

  if (existingAdmin && existingAdmin.role !== UserRole.admin) {
    throw new Error('ADMIN_SEED_EMAIL belongs to a non-admin user');
  }

  const admin =
    existingAdmin ??
    (await prisma.user.create({
      data: {
        email,
        username,
        nickname,
        timezone,
        role: UserRole.admin,
        status: UserStatus.active,
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
      },
    }));
  const adminCreated = !existingAdmin;

  let demoUser: {
    id: string;
    email: string;
    username: string;
    role: UserRole;
    status: UserStatus;
  } | null = null;

  if (demoUserEnabled) {
    const existingDemoUser = await prisma.user.findUnique({
      where: { email: demoEmail },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
      },
    });
    demoUser =
      existingDemoUser ??
      (await prisma.user.create({
        data: {
          email: demoEmail,
          username: demoUsername,
          nickname: demoNickname,
          timezone: demoTimezone,
          role: UserRole.user,
          status: UserStatus.active,
          passwordHash: await hashPassword(demoPassword),
          passwordChangedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
        },
      }));
  }

  console.log(
    JSON.stringify(
      {
        message: 'Admin seed completed',
        admin,
        adminCreated,
        demoUserEnabled,
        demoUser,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function assertSafeSeedPassword(name: string, value: string) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (
    !process.env[name] ||
    value === 'admin123456' ||
    value === 'demo123456' ||
    value.length < 12
  ) {
    throw new Error(`${name} must be explicitly set to a strong password in production`);
  }
}
