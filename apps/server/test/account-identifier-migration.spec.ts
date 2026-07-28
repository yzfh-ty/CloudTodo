import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../prisma/migrations/20260728_000021_validate_account_identifiers/migration.sql',
);

describe('account identifier migration', () => {
  it('blocks deployment when legacy identifiers would become unresolvable', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('email_shaped_usernames');
    expect(migration).toContain('cross_field_conflicts');
    expect(migration).toMatch(/POSITION\s*\(\s*'@'\s+IN\s+"username"\s*\)/iu);
    expect(migration).toMatch(/LOWER\s*\(\s*email_owner\."email"\s*\)\s*=\s*LOWER\s*\(\s*username_owner\."username"\s*\)/iu);
    expect(migration).toContain("ERRCODE = 'check_violation'");
  });

  it('adds a database constraint preventing new email-shaped usernames', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('users_username_not_email_shaped');
    expect(migration).toMatch(/ADD\s+CONSTRAINT[\s\S]+CHECK/iu);
  });
});
