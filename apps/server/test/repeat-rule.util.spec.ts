import { ReminderRepeatType } from '@prisma/client';
import { calculateNextRemindAt } from '../src/modules/scheduler/utils/repeat-rule.util';

describe('repeat rule util', () => {
  it('returns null for none repeat type', () => {
    const result = calculateNextRemindAt(
      {
        remindAt: new Date('2026-04-17T00:00:00Z'),
        repeatType: ReminderRepeatType.none,
        repeatRule: null,
      },
      new Date('2026-04-17T00:10:00Z'),
    );

    expect(result).toBeNull();
  });

  it('computes next daily reminder', () => {
    const result = calculateNextRemindAt(
      {
        remindAt: new Date('2026-04-17T08:00:00Z'),
        repeatType: ReminderRepeatType.daily,
        repeatRule: null,
      },
      new Date('2026-04-17T08:01:00Z'),
    );

    expect(result?.toISOString()).toBe('2026-04-18T08:00:00.000Z');
  });

  it('keeps the local daily time across a daylight-saving transition', () => {
    const result = calculateNextRemindAt(
      {
        // 09:00 in New York before the 2026 spring-forward transition.
        remindAt: new Date('2026-03-07T14:00:00Z'),
        timezone: 'America/New_York',
        repeatType: ReminderRepeatType.daily,
        repeatRule: null,
      },
      new Date('2026-03-07T14:01:00Z'),
    );

    // The next 09:00 is EDT (UTC-4), not another fixed 24-hour interval.
    expect(result?.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('returns to the configured local time after a nonexistent DST time', () => {
    const reminder = {
      // 02:30 in New York on the day before spring-forward.
      remindAt: new Date('2026-03-07T07:30:00Z'),
      timezone: 'America/New_York',
      repeatLocalTime: '02:30:00.000',
      repeatType: ReminderRepeatType.daily,
      repeatRule: null,
    };
    const shifted = calculateNextRemindAt(
      reminder,
      new Date('2026-03-07T07:31:00Z'),
    );
    expect(shifted?.toISOString()).toBe('2026-03-08T07:30:00.000Z');

    const restored = calculateNextRemindAt(
      { ...reminder, remindAt: shifted! },
      new Date('2026-03-08T07:31:00Z'),
    );
    expect(restored?.toISOString()).toBe('2026-03-09T06:30:00.000Z');
  });

  it('chooses the earlier ambiguous DST time and does not repeat it', () => {
    const reminder = {
      remindAt: new Date('2026-10-31T05:30:00Z'),
      timezone: 'America/New_York',
      repeatLocalTime: '01:30:00.000',
      repeatType: ReminderRepeatType.daily,
      repeatRule: null,
    };
    const ambiguous = calculateNextRemindAt(
      reminder,
      new Date('2026-10-31T05:31:00Z'),
    );
    expect(ambiguous?.toISOString()).toBe('2026-11-01T05:30:00.000Z');

    const following = calculateNextRemindAt(
      { ...reminder, remindAt: ambiguous! },
      new Date('2026-11-01T05:31:00Z'),
    );
    expect(following?.toISOString()).toBe('2026-11-02T06:30:00.000Z');
  });

  it('computes next workday reminder skipping weekend', () => {
    const result = calculateNextRemindAt(
      {
        remindAt: new Date('2026-04-17T08:00:00Z'),
        repeatType: ReminderRepeatType.workday,
        repeatRule: null,
      },
      new Date('2026-04-18T08:00:00Z'),
    );

    expect(result?.toISOString()).toBe('2026-04-20T08:00:00.000Z');
  });

  it('computes custom interval by minutes', () => {
    const result = calculateNextRemindAt(
      {
        remindAt: new Date('2026-04-17T08:00:00Z'),
        repeatType: ReminderRepeatType.custom,
        repeatRule: { interval_minutes: 30 },
      },
      new Date('2026-04-17T08:10:00Z'),
    );

    expect(result?.toISOString()).toBe('2026-04-17T08:30:00.000Z');
  });

  it('computes custom weekday rule', () => {
    const result = calculateNextRemindAt(
      {
        remindAt: new Date('2026-04-17T08:00:00Z'),
        repeatType: ReminderRepeatType.custom,
        repeatRule: { weekdays: [1, 3] },
      },
      new Date('2026-04-17T09:00:00Z'),
    );

    expect(result?.toISOString()).toBe('2026-04-20T08:00:00.000Z');
  });
});
