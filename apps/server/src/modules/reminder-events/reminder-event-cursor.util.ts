import { BadRequestException } from '@nestjs/common';
import type { ReminderChannel, ReminderEventStatus } from '@prisma/client';

const MAX_CURSOR_LENGTH = 2_048;

export interface ReminderEventCursorWindow {
  base: Date;
  upper: Date;
  page: number;
  pageSize: number;
  position: { at: Date; id: string } | null;
  status?: ReminderEventStatus;
  channel?: ReminderChannel;
}

interface SerializedReminderEventCursor {
  v: 1;
  b: string;
  u: string;
  p: number;
  s: number;
  t: string;
  i: string;
  st?: ReminderEventStatus;
  ch?: ReminderChannel;
}

export function parseReminderEventCursor(
  rawCursor: string | undefined,
  pageSize: number,
  status: ReminderEventStatus | undefined,
  channel: ReminderChannel | undefined,
  stableUpper: Date,
): ReminderEventCursorWindow {
  if (!rawCursor) {
    return createInitialWindow(new Date(0), pageSize, status, channel, stableUpper);
  }
  if (rawCursor.length > MAX_CURSOR_LENGTH) {
    throw invalidCursor();
  }

  const legacyDate = parseDate(rawCursor);
  if (legacyDate) {
    if (legacyDate > stableUpper) {
      throw invalidCursor();
    }
    return createInitialWindow(legacyDate, pageSize, status, channel, stableUpper);
  }

  try {
    const value = JSON.parse(
      Buffer.from(rawCursor, 'base64url').toString('utf8'),
    ) as Partial<SerializedReminderEventCursor>;
    const base = typeof value.b === 'string' ? parseDate(value.b) : null;
    const upper = typeof value.u === 'string' ? parseDate(value.u) : null;
    const positionAt = typeof value.t === 'string' ? parseDate(value.t) : null;
    if (
      value.v !== 1 ||
      !base ||
      !upper ||
      !positionAt ||
      base > positionAt ||
      positionAt > upper ||
      upper > stableUpper ||
      !Number.isSafeInteger(value.p) ||
      value.p! < 2 ||
      value.s !== pageSize ||
      typeof value.i !== 'string' ||
      !isUuid(value.i) ||
      value.st !== status ||
      value.ch !== channel
    ) {
      throw invalidCursor();
    }

    return {
      base,
      upper,
      page: value.p!,
      pageSize,
      position: { at: positionAt, id: value.i },
      status,
      channel,
    };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw invalidCursor();
  }
}

export function serializeReminderEventCursor(
  window: ReminderEventCursorWindow,
  position: { at: Date; id: string },
) {
  const value: SerializedReminderEventCursor = {
    v: 1,
    b: window.base.toISOString(),
    u: window.upper.toISOString(),
    p: window.page + 1,
    s: window.pageSize,
    t: position.at.toISOString(),
    i: position.id,
    ...(window.status ? { st: window.status } : {}),
    ...(window.channel ? { ch: window.channel } : {}),
  };
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createInitialWindow(
  base: Date,
  pageSize: number,
  status: ReminderEventStatus | undefined,
  channel: ReminderChannel | undefined,
  upper: Date,
): ReminderEventCursorWindow {
  return {
    base,
    upper,
    page: 1,
    pageSize,
    position: null,
    status,
    channel,
  };
}

function parseDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function invalidCursor() {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'cursor is invalid or incompatible with this request',
  });
}
