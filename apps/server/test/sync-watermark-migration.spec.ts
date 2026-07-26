import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('sync watermark migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20260724_000012_stabilize_sync_watermark/migration.sql',
    ),
    'utf8',
  );

  it('uses one per-user advisory lock protocol for readers and writers', () => {
    expect(migration).toContain(
      'pg_advisory_xact_lock("cloudtodo_sync_lock_key"(sync_user_id))',
    );
    expect(migration.match(/pg_advisory_xact_lock_shared/g)).toHaveLength(2);
    expect(migration).toContain(
      "RETURN date_trunc('milliseconds', clock_timestamp()) - INTERVAL '1 millisecond'",
    );
  });

  it('uses cursor-compatible database timestamp precision', () => {
    expect(
      migration.match(
        /observed_at := date_trunc\('milliseconds', clock_timestamp\(\)\)/g,
      ),
    ).toHaveLength(2);
    expect(migration).not.toMatch(/observed_at := clock_timestamp\(\)/);
  });

  it('installs insert and update timestamp barriers on every cursor entity', () => {
    const tables = [
      'todo_lists',
      'tags',
      'todos',
      'reminders',
      'reminder_events',
      'notification_endpoints',
      'notification_deliveries',
      'devices',
    ];

    for (const table of tables) {
      expect(migration).toContain(
        `BEFORE INSERT OR UPDATE OR DELETE ON "${table}"`,
      );
    }
  });

  it('keeps timestamps monotonic and resolves delivery ownership', () => {
    expect(migration).toContain(
      'NEW.updated_at := GREATEST(OLD.updated_at, observed_at)',
    );
    expect(migration).not.toContain('GREATEST(OLD.updated_at, NEW.updated_at');
    expect(migration).toContain('NEW.created_at := observed_at');
    expect(migration).toContain('NEW.updated_at := observed_at');
    expect(migration).toContain('FROM "reminder_events" AS reminder_event');
    expect(migration).toContain(
      'FROM "notification_endpoints" AS endpoint',
    );
  });

  it('atomically republishes legacy rows and clamps future creation times', () => {
    expect(migration.trimStart().startsWith(
      '-- Sync cursors use updated_at as a high watermark.',
    )).toBe(true);
    expect(migration).toContain('BEGIN;');
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(migration).toContain('IN SHARE ROW EXCLUSIVE MODE;');
    expect(migration).toContain(
      '"created_at" = LEAST(date_trunc(\'milliseconds\', "created_at"), normalized_at)',
    );

    const republishedTables = [
      'todo_lists',
      'tags',
      'todos',
      'reminders',
      'reminder_events',
      'notification_endpoints',
      'notification_deliveries',
      'devices',
    ];
    for (const table of republishedTables) {
      expect(migration).toMatch(
        new RegExp(
          `UPDATE "${table}"[\\s\\S]*?"updated_at" = normalized_at;`,
        ),
      );
    }
    expect(migration).toContain('UPDATE "todo_tags"');
  });
});
