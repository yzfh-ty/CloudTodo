import { Prisma, ReminderRepeatType } from '@prisma/client';

export function calculateNextRemindAt(
  reminder: {
    remindAt: Date;
    repeatType: ReminderRepeatType;
    repeatRule: Prisma.JsonValue | null;
  },
  now: Date,
): Date | null {
  if (reminder.repeatType === ReminderRepeatType.none) {
    return null;
  }

  let next = new Date(reminder.remindAt);
  let guard = 0;

  while (next <= now && guard < 500) {
    const candidate = advanceOnce(reminder.repeatType, next, reminder.repeatRule);
    if (!candidate) {
      return null;
    }

    next = candidate;
    guard += 1;
  }

  return next > now ? next : null;
}

function advanceOnce(
  repeatType: ReminderRepeatType,
  base: Date,
  repeatRule: Prisma.JsonValue | null,
): Date | null {
  switch (repeatType) {
    case ReminderRepeatType.daily:
      return addDays(base, 1);
    case ReminderRepeatType.weekly:
      return addDays(base, 7);
    case ReminderRepeatType.workday:
      return nextWorkday(base);
    case ReminderRepeatType.custom:
      return advanceCustomRule(base, repeatRule);
    case ReminderRepeatType.none:
    default:
      return null;
  }
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextWorkday(base: Date): Date {
  const next = new Date(base);
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
  return next;
}

function advanceCustomRule(base: Date, repeatRule: Prisma.JsonValue | null): Date | null {
  if (!repeatRule || typeof repeatRule !== 'object' || Array.isArray(repeatRule)) {
    return null;
  }

  const rule = repeatRule as Record<string, unknown>;
  const intervalMinutes = toPositiveInteger(rule.interval_minutes);
  const intervalHours = toPositiveInteger(rule.interval_hours);
  const intervalDays = toPositiveInteger(rule.interval_days);
  const intervalWeeks = toPositiveInteger(rule.interval_weeks);

  if (intervalMinutes) {
    return new Date(base.getTime() + intervalMinutes * 60 * 1000);
  }

  if (intervalHours) {
    return new Date(base.getTime() + intervalHours * 60 * 60 * 1000);
  }

  if (intervalDays) {
    return addDays(base, intervalDays);
  }

  if (intervalWeeks) {
    return addDays(base, intervalWeeks * 7);
  }

  if (Array.isArray(rule.weekdays)) {
    const weekdays = rule.weekdays
      .map((value) => toWeekday(value))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    if (weekdays.length === 0) {
      return null;
    }

    const next = new Date(base);
    for (let i = 0; i < 8; i += 1) {
      next.setUTCDate(next.getUTCDate() + 1);
      if (weekdays.includes(next.getUTCDay())) {
        return next;
      }
    }
  }

  return null;
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function toWeekday(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) {
    return null;
  }
  return value;
}
