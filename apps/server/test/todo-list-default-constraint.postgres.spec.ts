import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

const databaseUrl = process.env.SYNC_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('default todo-list database invariant', () => {
  let prisma: PrismaClient;
  let userId: string | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
  });

  afterEach(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    userId = undefined;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a second live default list for the same user', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `default-list-${suffix}@example.test`,
        username: `default_list_${suffix}`.slice(0, 64),
        passwordHash: 'not-used-by-this-test',
        nickname: 'Default List Test',
        role: UserRole.user,
        status: UserStatus.active,
      },
    });
    userId = user.id;

    await prisma.todoList.create({
      data: { userId, name: 'First', isDefault: true },
    });
    await expect(
      prisma.todoList.create({
        data: { userId, name: 'Second', isDefault: true },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
