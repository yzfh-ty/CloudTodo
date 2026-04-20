import 'dotenv/config';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '../src/common/security/password.util';

const prisma = new PrismaClient();

async function main() {
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

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      username,
      nickname,
      timezone,
      role: UserRole.admin,
      status: UserStatus.active,
      passwordHash: hashPassword(password),
      passwordChangedAt: new Date(),
      deletedAt: null,
    },
    create: {
      email,
      username,
      nickname,
      timezone,
      role: UserRole.admin,
      status: UserStatus.active,
      passwordHash: hashPassword(password),
      passwordChangedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      status: true,
    },
  });

  let demoUser: {
    id: string;
    email: string;
    username: string;
    role: UserRole;
    status: UserStatus;
  } | null = null;

  if (demoUserEnabled) {
    demoUser = await prisma.user.upsert({
      where: { email: demoEmail },
      update: {
        username: demoUsername,
        nickname: demoNickname,
        timezone: demoTimezone,
        role: UserRole.user,
        status: UserStatus.active,
        passwordHash: hashPassword(demoPassword),
        passwordChangedAt: new Date(),
        deletedAt: null,
        forcePasswordChange: false,
      },
      create: {
        email: demoEmail,
        username: demoUsername,
        nickname: demoNickname,
        timezone: demoTimezone,
        role: UserRole.user,
        status: UserStatus.active,
        passwordHash: hashPassword(demoPassword),
        passwordChangedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        message: 'Admin seed completed',
        admin,
        demoUserEnabled,
        demoUser,
        login: {
          account: email,
          password,
        },
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
