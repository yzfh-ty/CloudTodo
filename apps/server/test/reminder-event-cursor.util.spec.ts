import { ReminderChannel, ReminderEventStatus } from '@prisma/client';
import {
  parseReminderEventCursor,
  serializeReminderEventCursor,
} from '../src/modules/reminder-events/reminder-event-cursor.util';

describe('reminder event cursor', () => {
  const stableUpper = new Date('2026-07-28T12:00:00.000Z');

  it('round trips a keyset position and binds pagination filters', () => {
    const first = parseReminderEventCursor(
      '2026-07-28T10:00:00.000Z',
      25,
      ReminderEventStatus.pending,
      ReminderChannel.android_local,
      stableUpper,
    );
    const cursor = serializeReminderEventCursor(first, {
      at: new Date('2026-07-28T11:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000001',
    });

    expect(
      parseReminderEventCursor(
        cursor,
        25,
        ReminderEventStatus.pending,
        ReminderChannel.android_local,
        stableUpper,
      ),
    ).toEqual({
      base: new Date('2026-07-28T10:00:00.000Z'),
      upper: stableUpper,
      page: 2,
      pageSize: 25,
      position: {
        at: new Date('2026-07-28T11:00:00.000Z'),
        id: '00000000-0000-4000-8000-000000000001',
      },
      status: ReminderEventStatus.pending,
      channel: ReminderChannel.android_local,
    });
    expect(() =>
      parseReminderEventCursor(
        cursor,
        25,
        ReminderEventStatus.processed,
        ReminderChannel.android_local,
        stableUpper,
      ),
    ).toThrow('cursor');
  });

  it('rejects non-ISO legacy timestamps', () => {
    expect(() =>
      parseReminderEventCursor('1', 25, undefined, undefined, stableUpper),
    ).toThrow('cursor');
  });
});
