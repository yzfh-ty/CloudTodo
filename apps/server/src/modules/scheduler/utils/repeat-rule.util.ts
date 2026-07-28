import { Prisma, ReminderRepeatType } from '@prisma/client';
import { DateTime } from 'luxon';

export function calculateNextRemindAt(
  reminder: {
    remindAt: Date;
    timezone?: string | null;
    repeatLocalTime?: string | null;
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
    const candidate = advanceOnce(
      reminder.repeatType,
      next,
      reminder.repeatRule,
      reminder.timezone,
      reminder.repeatLocalTime,
    );
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
  timezone?: string | null,
  repeatLocalTime?: string | null,
): Date | null {
  switch (repeatType) {
    case ReminderRepeatType.daily:
      return addCalendarDays(base, 1, timezone, repeatLocalTime);
    case ReminderRepeatType.weekly:
      return addCalendarDays(base, 7, timezone, repeatLocalTime);
    case ReminderRepeatType.workday:
      return nextWorkday(base, timezone, repeatLocalTime);
    case ReminderRepeatType.custom:
      return advanceCustomRule(base, repeatRule, timezone, repeatLocalTime);
    case ReminderRepeatType.none:
    default:
      return null;
  }
}

function addCalendarDays(
  base: Date,
  days: number,
  timezone?: string | null,
  repeatLocalTime?: string | null,
): Date {
  const zoned = inReminderZone(base, timezone);
  const targetDate = zoned.startOf('day').plus({ days });
  return resolveLocalTime(targetDate, repeatLocalTime, zoned).toUTC().toJSDate();
}

function nextWorkday(
  base: Date,
  timezone?: string | null,
  repeatLocalTime?: string | null,
): Date {
  let next = inReminderZone(base, timezone);
  do {
    next = next.plus({ days: 1 });
  } while (next.weekday === 6 || next.weekday === 7);
  return resolveLocalTime(next.startOf('day'), repeatLocalTime, inReminderZone(base, timezone))
    .toUTC()
    .toJSDate();
}

function advanceCustomRule(
  base: Date,
  repeatRule: Prisma.JsonValue | null,
  timezone?: string | null,
  repeatLocalTime?: string | null,
): Date | null {
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
    return addCalendarDays(base, intervalDays, timezone, repeatLocalTime);
  }

  if (intervalWeeks) {
    return addCalendarDays(base, intervalWeeks * 7, timezone, repeatLocalTime);
  }

  if (Array.isArray(rule.weekdays)) {
    const weekdays = rule.weekdays
      .map((value) => toWeekday(value))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    if (weekdays.length === 0) {
      return null;
    }

    let next = inReminderZone(base, timezone);
    for (let i = 0; i < 8; i += 1) {
      next = next.plus({ days: 1 });
      if (weekdays.includes(next.weekday % 7)) {
        return resolveLocalTime(
          next.startOf('day'),
          repeatLocalTime,
          inReminderZone(base, timezone),
        )
          .toUTC()
          .toJSDate();
      }
    }
  }

  return null;
}

function inReminderZone(base: Date, timezone?: string | null): DateTime {
  const zoned = DateTime.fromJSDate(base, { zone: 'utc' }).setZone(timezone || 'UTC');
  return zoned.isValid ? zoned : DateTime.fromJSDate(base, { zone: 'utc' });
}

export function repeatLocalTimeFor(base: Date, timezone?: string | null): string {
  const zoned = inReminderZone(base, timezone);
  return [
    String(zoned.hour).padStart(2, '0'),
    String(zoned.minute).padStart(2, '0'),
    `${String(zoned.second).padStart(2, '0')}.${String(zoned.millisecond).padStart(3, '0')}`,
  ].join(':');
}

function resolveLocalTime(
  localDate: DateTime,
  repeatLocalTime: string | null | undefined,
  fallbackTime: DateTime,
): DateTime {
  const parsed = parseLocalTime(repeatLocalTime) ?? {
    hour: fallbackTime.hour,
    minute: fallbackTime.minute,
    second: fallbackTime.second,
    millisecond: fallbackTime.millisecond,
  };
  const candidate = DateTime.fromObject(
    {
      year: localDate.year,
      month: localDate.month,
      day: localDate.day,
      ...parsed,
    },
    { zone: localDate.zoneName ?? 'UTC' },
  );
  if (!candidate.isValid) {
    return localDate.set(parsed);
  }

  // Luxon shifts nonexistent wall times forward by the DST gap. Ambiguous
  // times have two valid offsets; consistently choose the earlier instant so
  // a daily reminder fires once and later dates return to the stored anchor.
  return candidate
    .getPossibleOffsets()
    .reduce((earliest, option) => (option.toMillis() < earliest.toMillis() ? option : earliest));
}

function parseLocalTime(value: string | null | undefined) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/u.exec(value ?? '');
  if (!match) return null;
  const [hour, minute, second, millisecond] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second, millisecond };
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
