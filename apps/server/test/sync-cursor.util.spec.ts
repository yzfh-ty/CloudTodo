import {
  DEFAULT_SYNC_PAGE_SIZE,
  MAX_SYNC_CURSOR_PAGES,
  parseSyncCursor,
  serializeSyncCursor,
} from '../src/modules/sync/sync-cursor.util';

describe('sync cursor windows', () => {
  const now = new Date('2026-07-23T12:00:00.000Z');
  const todoId = '00000000-0000-0000-0000-000000000001';

  it('turns a legacy ISO cursor into a frozen first page', () => {
    const window = parseSyncCursor('2026-07-23T11:00:00.000Z', 25, now);

    expect(window).toEqual({
      base: new Date('2026-07-23T11:00:00.000Z'),
      upper: now,
      page: 1,
      pageSize: 25,
      positions: {},
      done: {},
      mode: 'keyset',
    });
  });

  it('round-trips an opaque continuation without moving its upper bound', () => {
    const first = parseSyncCursor('2026-07-23T11:00:00.000Z', 25, now);
    const positionAt = new Date('2026-07-23T11:30:00.000Z');
    const cursor = serializeSyncCursor(
      first,
      2,
      { todos: { at: positionAt, id: todoId } },
      { tags: true, todos: false },
    );
    const resumed = parseSyncCursor(
      cursor,
      25,
      new Date('2026-07-23T13:00:00.000Z'),
    );

    expect(resumed.base).toEqual(first.base);
    expect(resumed.upper).toEqual(now);
    expect(resumed.page).toBe(2);
    expect(resumed.pageSize).toBe(25);
    expect(resumed.mode).toBe('keyset');
    expect(resumed.positions).toEqual({
      todos: { at: positionAt, id: todoId },
    });
    expect(resumed.done).toEqual({ tags: true, todos: false });
  });

  it('rejects changing page_size while continuing an opaque cursor', () => {
    const first = parseSyncCursor('2026-07-23T11:00:00.000Z', 25, now);
    const cursor = serializeSyncCursor(first, 2);

    expect(() =>
      parseSyncCursor(cursor, 50, new Date('2026-07-23T13:00:00.000Z')),
    ).toThrow('cursor');
  });

  it('keeps old unbound opaque cursors on the default page size only', () => {
    const cursor = Buffer.from(
      JSON.stringify({
        v: 1,
        b: '2026-07-23T11:00:00.000Z',
        u: now.toISOString(),
        p: 2,
      }),
      'utf8',
    ).toString('base64url');

    expect(parseSyncCursor(cursor, DEFAULT_SYNC_PAGE_SIZE, now).mode).toBe(
      'offset',
    );
    expect(() => parseSyncCursor(cursor, 25, now)).toThrow('cursor');
  });

  it('preserves a bound v1 cursor page_size and offset mode', () => {
    const cursor = Buffer.from(
      JSON.stringify({
        v: 1,
        b: '2026-07-23T11:00:00.000Z',
        u: now.toISOString(),
        p: 2,
        s: 25,
      }),
      'utf8',
    ).toString('base64url');

    expect(parseSyncCursor(cursor, 25, now)).toEqual({
      base: new Date('2026-07-23T11:00:00.000Z'),
      upper: now,
      page: 2,
      pageSize: 25,
      positions: {},
      done: {},
      mode: 'offset',
    });
    expect(() => parseSyncCursor(cursor, 50, now)).toThrow('cursor');
  });

  it('rejects malformed, future, and excessive-page cursors', () => {
    expect(() => parseSyncCursor('not-a-cursor', 50, now)).toThrow('cursor');
    expect(() => parseSyncCursor('2026-07-24T12:00:00.000Z', 50, now)).toThrow(
      'cursor',
    );
    expect(() =>
      serializeSyncCursor(
        {
          base: new Date('2026-07-23T11:00:00.000Z'),
          upper: now,
          page: 1,
          pageSize: 50,
          positions: {},
          done: {},
          mode: 'keyset',
        },
        MAX_SYNC_CURSOR_PAGES + 1,
      ),
    ).toThrow('cursor');
  });
});
