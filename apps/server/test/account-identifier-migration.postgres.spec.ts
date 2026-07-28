import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.SYNC_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const migration = readFileSync(
  resolve(
    __dirname,
    '../prisma/migrations/20260728_000021_validate_account_identifiers/migration.sql',
  ),
  'utf8',
);
const migrationBlockEnd = migration.indexOf('$migration$;') + '$migration$;'.length;
const migrationStatements = [
  migration.slice(0, migrationBlockEnd),
  migration.slice(migrationBlockEnd),
].filter((statement) => statement.trim().length > 0);

describeWithPostgres('account identifier migration on PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function runInLegacySchema(rows: Array<[string, string, string]>, after?: string) {
    const schema = `account_migration_${Math.random().toString(16).slice(2)}`;
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "users" ("id" UUID PRIMARY KEY, "email" TEXT NOT NULL, "username" TEXT NOT NULL)',
      );
      for (const [id, email, username] of rows) {
        await tx.$executeRawUnsafe(
          'INSERT INTO "users" ("id", "email", "username") VALUES ($1::uuid, $2, $3)',
          id,
          email,
          username,
        );
      }
      for (const statement of migrationStatements) {
        await tx.$executeRawUnsafe(statement);
      }
      if (after) {
        await tx.$executeRawUnsafe(after);
      }
    });
  }

  it('rejects a legacy username containing @', async () => {
    await expect(
      runInLegacySchema([
        ['00000000-0000-0000-0000-000000000001', 'legacy-owner@example.test', 'legacy@example.test'],
      ]),
    ).rejects.toThrow(/account identifier precondition failed/iu);
  });

  it('rejects an email/username conflict owned by different users', async () => {
    await expect(
      runInLegacySchema([
        ['00000000-0000-0000-0000-000000000001', 'owner@example.test', 'owner'],
        ['00000000-0000-0000-0000-000000000002', 'other@example.test', 'owner@example.test'],
      ]),
    ).rejects.toThrow(/account identifier precondition failed/iu);
  });

  it('adds a constraint after clean history passes validation', async () => {
    await expect(
      runInLegacySchema(
        [['00000000-0000-0000-0000-000000000001', 'clean@example.test', 'clean']],
        `INSERT INTO "users" ("id", "email", "username") VALUES
          ('00000000-0000-0000-0000-000000000002', 'new@example.test', 'blocked@example.test')`,
      ),
    ).rejects.toThrow(/users_username_not_email_shaped/iu);
  });
});
