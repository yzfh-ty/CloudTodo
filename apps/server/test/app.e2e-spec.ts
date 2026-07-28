import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/database/prisma.service';
import { hashPassword } from '../src/common/security/password.util';
import { UserSessionService } from '../src/modules/auth/user-session.service';
import { UserRole, UserStatus } from '@prisma/client';

describe('App integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.SCHEDULER_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'admin', method: RequestMethod.GET },
        { path: 'admin/login', method: RequestMethod.GET },
      ],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await app.close();
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  it('protects /admin and serves login page', async () => {
    await request(app.getHttpServer()).get('/admin').expect(302).expect('Location', '/admin/login');

    const loginPage = await request(app.getHttpServer()).get('/admin/login').expect(200);
    expect(loginPage.text).toContain('管理员登录');
    expect(loginPage.text).toContain('loginForm');
  });

  it('allows admin login and access to admin pages and APIs', async () => {
    const adminEmail = `itest_admin_${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        email: adminEmail,
        username: `itest_admin_${Date.now()}`,
        nickname: 'ITest Admin',
        role: UserRole.admin,
        status: UserStatus.active,
        timezone: 'UTC',
        passwordHash: await hashPassword('admin123456'),
      },
    });

    const agent = request.agent(app.getHttpServer());
    const loginResponse = await agent
      .post('/api/admin/auth/login')
      .send({ account: adminEmail, password: 'admin123456' })
      .expect(201);

    expect(loginResponse.body.code).toBe('OK');
    expect(loginResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('cloudtodo_admin_session=')]),
    );
    await agent.post('/api/admin/auth/logout').expect(403);

    const adminPage = await agent.get('/admin').expect(200);
    expect(adminPage.text).toContain('CloudTodo Admin');
    expect(adminPage.text).toContain('logoutBtn');

    const usersResponse = await agent.get('/api/admin/users?page=1&page_size=10').expect(200);
    expect(usersResponse.body.code).toBe('OK');
    expect(Array.isArray(usersResponse.body.data.items)).toBe(true);
  });

  it('supports user register/login/logout and todo flow', async () => {
    const suffix = Date.now();
    const email = `itest_user_${suffix}@example.com`;
    const username = `itest_user_${suffix}`;
    const agent = request.agent(app.getHttpServer());

    const registerResponse = await agent
      .post('/api/auth/register')
      .send({
        email,
        username,
        password: 'user123456',
        nickname: 'ITest User',
        timezone: 'UTC',
      })
      .expect(201);

    expect(registerResponse.body.code).toBe('OK');
    expect(registerResponse.body.data.user.timezone).toBe('Asia/Shanghai');
    expect(registerResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cloudtodo_user_session='),
        expect.stringContaining('cloudtodo_user_refresh_token='),
      ]),
    );
    const userCsrfToken = csrfTokenFrom(registerResponse, 'cloudtodo_user_csrf_token');

    const meResponse = await agent.get('/api/users/me').expect(200);
    expect(meResponse.body.data.email).toBe(email);

    await agent
      .post('/api/todos')
      .send({
        title: 'Missing CSRF Todo',
        priority: 'medium',
        source_platform: 'web',
      })
      .expect(403);

    const todoResponse = await agent
      .post('/api/todos')
      .set('X-CSRF-Token', userCsrfToken)
      .send({
        title: 'Integration Todo',
        description: 'from integration test',
        priority: 'medium',
        source_platform: 'web',
      })
      .expect(201);

    const todoId = todoResponse.body.data.id as string;
    expect(todoResponse.body.data.title).toBe('Integration Todo');

    const timezoneResponse = await agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', userCsrfToken)
      .send({ timezone: 'Europe/Berlin' })
      .expect(200);
    expect(timezoneResponse.body.data.timezone).toBe('Europe/Berlin');

    const reminderResponse = await agent
      .post(`/api/todos/${todoId}/reminders`)
      .set('X-CSRF-Token', userCsrfToken)
      .send({
        channel: 'both',
        remind_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        timezone: 'UTC',
      })
      .expect(201);
    const reminderId = reminderResponse.body.data.id as string;
    expect(reminderResponse.body.data.timezone).toBe('Europe/Berlin');

    await agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', userCsrfToken)
      .send({ timezone: 'Asia/Tokyo' })
      .expect(200);
    const remindersResponse = await agent.get('/api/reminders/upcoming').expect(200);
    const syncedReminder = remindersResponse.body.data.items.find(
      (item: { id: string }) => item.id === reminderId,
    );
    expect(syncedReminder.timezone).toBe('Asia/Tokyo');
    expect(syncedReminder.channel).toBe('both');
    expect(syncedReminder.todo.title).toBe('Integration Todo');

    const listResponse = await agent.get('/api/todos?page=1&page_size=10').expect(200);
    expect(listResponse.body.data.items.some((item: { id: string }) => item.id === todoId)).toBe(true);

    const pendingSummaryResponse = await agent.get('/api/todos/summary').expect(200);
    expect(pendingSummaryResponse.body.data).toEqual({
      total: 1,
      pending: 1,
      completed: 0,
      archived: 0,
    });

    await agent
      .post(`/api/todos/${todoId}/complete`)
      .set('X-CSRF-Token', userCsrfToken)
      .expect(201);

    const completedSummaryResponse = await agent.get('/api/todos/summary').expect(200);
    expect(completedSummaryResponse.body.data).toEqual({
      total: 1,
      pending: 0,
      completed: 1,
      archived: 0,
    });

    const refreshResponse = await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', userCsrfToken)
      .expect(201);
    const refreshedCsrfToken = csrfTokenFrom(refreshResponse, 'cloudtodo_user_csrf_token');
    await agent.post('/api/auth/logout').set('X-CSRF-Token', refreshedCsrfToken).expect(201);
    await agent.get('/api/users/me').expect(401);
  });

  it('revokes a rotated refresh family when the access session has expired', async () => {
    const suffix = Date.now();
    const email = `itest_expired_logout_${suffix}@example.com`;
    const username = `itest_expired_logout_${suffix}`;
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        username,
        password: 'user123456',
        nickname: 'Expired Logout User',
        timezone: 'UTC',
      })
      .expect(201);

    const csrfToken = csrfTokenFrom(registerResponse, 'cloudtodo_user_csrf_token');
    const authenticatedCookies = cookieHeaderFrom(registerResponse);
    const attackerRefreshResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', authenticatedCookies)
      .set('X-CSRF-Token', csrfToken)
      .expect(201);
    const attackerCookies = cookieHeaderFrom(attackerRefreshResponse);
    const attackerCsrfToken = csrfTokenFrom(
      attackerRefreshResponse,
      'cloudtodo_user_csrf_token',
    );
    const expiredSession = app.get(UserSessionService).createSessionToken(
      registerResponse.body.data.user.id as string,
      UserRole.user,
      {
        issuedAtMs:
          Date.now() - (UserSessionService.SESSION_TTL_SECONDS + 1) * 1000,
      },
    );
    const expiredAccessCookies = authenticatedCookies
      .split('; ')
      .map((cookie) =>
        cookie.startsWith('cloudtodo_user_session=')
          ? `cloudtodo_user_session=${expiredSession}`
          : cookie,
      )
      .join('; ');

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', expiredAccessCookies)
      .set('X-CSRF-Token', csrfToken)
      .expect(201);

    expect(logoutResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cloudtodo_user_session=;'),
        expect.stringContaining('cloudtodo_user_refresh_token=;'),
        expect.stringContaining('cloudtodo_user_csrf_token=;'),
      ]),
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: {
        sessionRevokedAt: true,
        authRefreshTokens: {
          select: { revokedAt: true, revokeReason: true },
        },
      },
    });
    expect(user.sessionRevokedAt).not.toBeNull();
    expect(user.authRefreshTokens).not.toHaveLength(0);
    expect(user.authRefreshTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          revokedAt: expect.any(Date),
          revokeReason: 'logout',
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', attackerCookies)
      .set('X-CSRF-Token', attackerCsrfToken)
      .expect(401);
  });

  function csrfTokenFrom(
    response: request.Response,
    cookieName: 'cloudtodo_user_csrf_token' | 'cloudtodo_admin_csrf_token',
  ) {
    const setCookieHeader = response.headers['set-cookie'] as unknown;
    const setCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : typeof setCookieHeader === 'string'
        ? [setCookieHeader]
        : undefined;
    const cookie = setCookie?.find((value) => value.startsWith(`${cookieName}=`));
    if (!cookie) {
      throw new Error(`${cookieName} was not set`);
    }

    return decodeURIComponent(cookie.split(';')[0].slice(cookieName.length + 1));
  }

  function cookieHeaderFrom(response: request.Response) {
    const setCookieHeader = response.headers['set-cookie'] as unknown;
    const setCookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : typeof setCookieHeader === 'string'
        ? [setCookieHeader]
        : [];
    return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }

  async function cleanupTestUsers() {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: 'itest_' } },
          { username: { startsWith: 'itest_' } },
        ],
      },
    });
  }
});
