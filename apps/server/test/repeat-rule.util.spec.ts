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
