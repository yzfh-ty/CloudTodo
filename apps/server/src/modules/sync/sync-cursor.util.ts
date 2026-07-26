import { BadRequestException } from '@nestjs/common';

export const MAX_SYNC_CURSOR_PAGES = 1_000;
export const MAX_SYNC_PAGE_SIZE = 100;
export const DEFAULT_SYNC_PAGE_SIZE = 50;
export const MAX_SYNC_CURSOR_LENGTH = 4_096;

export const SYNC_CHANGE_COLLECTIONS = [
  'todo_lists',
  'tags',
  'todos',
  'reminders',
  'reminder_events',
  'notification_endpoints',
  'notification_deliveries',
  'devices',
] as const;

export type SyncChangeCollection = (typeof SYNC_CHANGE_COLLECTIONS)[number];
export type SyncCursorMode = 'keyset' | 'offset';

export interface SyncCursorPosition {
  at: Date;
  id: string;
}

export type SyncCursorPositions = Partial<
  Record<SyncChangeCollection, SyncCursorPosition>
>;
export type SyncCursorDone = Partial<Record<SyncChangeCollection, boolean>>;

export interface SyncCursorWindow {
  base: Date;
  upper: Date;
  page: number;
  pageSize: number;
  positions: SyncCursorPositions;
  done: SyncCursorDone;
  mode: SyncCursorMode;
}

interface SerializedSyncCursor {
  v: 2;
  b: string;
  u: string;
  p: number;
  s: number;
  k: Partial<Record<SyncChangeCollection, SerializedSyncPosition>>;
  d: SyncCursorDone;
}

interface SerializedLegacySyncCursor {
  v: 1;
  b: string;
  u: string;
  p: number;
  s?: number;
}

interface SerializedSyncPosition {
  t: string;
  i: string;
}

type UnknownRecord = Record<string, unknown>;

export function parseSyncCursor(
  rawCursor: string | undefined,
  pageSize: number,
  now = new Date(),
): SyncCursorWindow {
  if (!isValidPageSize(pageSize) || !isValidDate(now)) {
    throw invalidCursor();
  }

  if (!rawCursor) {
    return {
      base: new Date(0),
      upper: now,
      page: 1,
      pageSize,
      positions: {},
      done: {},
      mode: 'keyset',
    };
  }
  if (rawCursor.length > MAX_SYNC_CURSOR_LENGTH) {
    throw invalidCursor();
  }

  const legacyDate = parseDate(rawCursor);
  if (legacyDate) {
    if (legacyDate > now) {
      throw invalidCursor();
    }
    return {
      base: legacyDate,
      upper: now,
      page: 1,
      pageSize,
      positions: {},
      done: {},
      mode: 'keyset',
    };
  }

  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    const value = JSON.parse(decoded) as unknown;
    if (!isRecord(value)) {
      throw invalidCursor();
    }

    const base = typeof value.b === 'string' ? parseDate(value.b) : null;
    const upper = typeof value.u === 'string' ? parseDate(value.u) : null;
    const page = typeof value.p === 'number' ? value.p : Number.NaN;
    if (
      !base ||
      !upper ||
      base > upper ||
      upper.getTime() > now.getTime() + 60_000 ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > MAX_SYNC_CURSOR_PAGES
    ) {
      throw invalidCursor();
    }

    if (value.v === 1) {
      // Cursors emitted before keyset pagination used offset semantics. Older
      // versions did not carry page_size, so only the server default is safe.
      const legacyPageSize = value.s ?? DEFAULT_SYNC_PAGE_SIZE;
      if (!isValidPageSize(legacyPageSize) || legacyPageSize !== pageSize) {
        throw invalidCursor();
      }
      return {
        base,
        upper,
        page,
        pageSize,
        positions: {},
        done: {},
        mode: 'offset',
      };
    }

    if (value.v !== 2 || !isRecord(value.k)) {
      throw invalidCursor();
    }
    const positions = parsePositions(value.k, base, upper);
    if (!positions) {
      throw invalidCursor();
    }
    if (!isValidPageSize(value.s) || value.s !== pageSize) {
      throw invalidCursor();
    }
    const done = value.d === undefined ? {} : parseDone(value.d);
    if (!done) {
      throw invalidCursor();
    }
    return {
      base,
      upper,
      page,
      pageSize,
      positions,
      done,
      mode: 'keyset',
    };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw invalidCursor();
  }
}

export function serializeSyncCursor(
  window: SyncCursorWindow,
  nextPage: number,
  positions = window.positions,
  done = window.done,
) {
  if (
    !Number.isInteger(nextPage) ||
    nextPage < 1 ||
    nextPage > MAX_SYNC_CURSOR_PAGES ||
    !isValidPageSize(window.pageSize) ||
    !isValidDate(window.base) ||
    !isValidDate(window.upper) ||
    window.base > window.upper
  ) {
    throw invalidCursor();
  }

  if (window.mode === 'offset') {
    const value: SerializedLegacySyncCursor = {
      v: 1,
      b: window.base.toISOString(),
      u: window.upper.toISOString(),
      p: nextPage,
      s: window.pageSize,
    };
    return encodeCursor(value);
  }

  const serializedPositions = serializePositions(
    positions,
    window.base,
    window.upper,
  );
  const serializedDone = serializeDone(done);
  const value: SerializedSyncCursor = {
    v: 2,
    b: window.base.toISOString(),
    u: window.upper.toISOString(),
    p: nextPage,
    s: window.pageSize,
    k: serializedPositions,
    d: serializedDone,
  };
  return encodeCursor(value);
}

function parseDone(value: unknown): SyncCursorDone | null {
  if (!isRecord(value)) {
    return null;
  }
  const done: SyncCursorDone = {};
  for (const [collection, rawDone] of Object.entries(value)) {
    if (!isSyncChangeCollection(collection) || typeof rawDone !== 'boolean') {
      return null;
    }
    done[collection] = rawDone;
  }
  return done;
}

function parsePositions(
  value: UnknownRecord,
  base: Date,
  upper: Date,
): SyncCursorPositions | null {
  const positions: SyncCursorPositions = {};
  for (const [collection, rawPosition] of Object.entries(value)) {
    if (!isSyncChangeCollection(collection)) {
      return null;
    }
    const position = parsePosition(rawPosition, base, upper);
    if (!position) {
      return null;
    }
    positions[collection] = position;
  }
  return positions;
}

function parsePosition(
  value: unknown,
  base: Date,
  upper: Date,
): SyncCursorPosition | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.t !== 'string' ||
    typeof value.i !== 'string' ||
    !isValidId(value.i) ||
    value.j !== undefined
  ) {
    return null;
  }
  const at = parseDate(value.t);
  if (!at || at < base || at > upper) {
    return null;
  }
  return {
    at,
    id: value.i,
  };
}

function serializePositions(
  positions: SyncCursorPositions,
  base: Date,
  upper: Date,
): Partial<Record<SyncChangeCollection, SerializedSyncPosition>> {
  const serialized: Partial<
    Record<SyncChangeCollection, SerializedSyncPosition>
  > = {};
  for (const [collection, position] of Object.entries(positions)) {
    if (!isSyncChangeCollection(collection) || !position) {
      throw invalidCursor();
    }
    if (
      !isValidDate(position.at) ||
      position.at < base ||
      position.at > upper ||
      !isValidId(position.id)
    ) {
      throw invalidCursor();
    }
    serialized[collection] = {
      t: position.at.toISOString(),
      i: position.id,
    };
  }
  return serialized;
}

function serializeDone(done: SyncCursorDone): SyncCursorDone {
  const serialized: SyncCursorDone = {};
  for (const [collection, value] of Object.entries(done)) {
    if (!isSyncChangeCollection(collection) || typeof value !== 'boolean') {
      throw invalidCursor();
    }
    serialized[collection] = value;
  }
  return serialized;
}

function encodeCursor(value: SerializedSyncCursor | SerializedLegacySyncCursor) {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString(
    'base64url',
  );
  if (encoded.length > MAX_SYNC_CURSOR_LENGTH) {
    throw invalidCursor();
  }
  return encoded;
}

function isSyncChangeCollection(value: string): value is SyncChangeCollection {
  return (SYNC_CHANGE_COLLECTIONS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isValidPageSize(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= 1 &&
    Number(value) <= MAX_SYNC_PAGE_SIZE
  );
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function parseDate(value: string) {
  const date = new Date(value);
  return isValidDate(date) ? date : null;
}

function invalidCursor() {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'cursor is invalid or expired',
  });
}
