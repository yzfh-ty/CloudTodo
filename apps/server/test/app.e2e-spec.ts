import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/database/prisma.service';
import { hashPassword } from '../src/common/security/password.util';
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
        passwordHash: hashPassword('admin123456'),
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
    expect(registerResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cloudtodo_user_session='),
        expect.stringContaining('cloudtodo_user_refresh_token='),
      ]),
    );

    const meResponse = await agent.get('/api/users/me').expect(200);
    expect(meResponse.body.data.email).toBe(email);

    const todoResponse = await agent
      .post('/api/todos')
      .send({
        title: 'Integration Todo',
        description: 'from integration test',
        priority: 'medium',
        source_platform: 'web',
      })
      .expect(201);

    const todoId = todoResponse.body.data.id as string;
    expect(todoResponse.body.data.title).toBe('Integration Todo');

    const listResponse = await agent.get('/api/todos?page=1&page_size=10').expect(200);
    expect(listResponse.body.data.items.some((item: { id: string }) => item.id === todoId)).toBe(true);

    await agent.post(`/api/todos/${todoId}/complete`).expect(201);
    await agent.post('/api/auth/refresh').expect(201);
    await agent.post('/api/auth/logout').expect(201);
    await agent.get('/api/users/me').expect(401);
  });

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
