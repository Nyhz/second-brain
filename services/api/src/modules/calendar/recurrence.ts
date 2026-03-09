import type {
  CalendarEvent,
  CalendarOccurrence,
  CalendarReminderOccurrence,
  CalendarReminderStatus,
} from '@second-brain/types';

type SupportedFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

type ParsedRRule = {
  freq: SupportedFrequency;
  interval: number;
  count: number | null;
  untilAt: Date | null;
  byDay: number[];
  byMonthDay: number[];
};

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const startOfUtcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addMinutes = (value: Date, minutes: number) =>
  new Date(value.valueOf() + minutes * 60_000);

const diffUtcDays = (left: Date, right: Date) =>
  Math.floor(
    (startOfUtcDay(left).valueOf() - startOfUtcDay(right).valueOf()) / 86_400_000,
  );

const diffUtcWeeks = (left: Date, right: Date) =>
  Math.floor(diffUtcDays(left, right) / 7);

const diffUtcMonths = (left: Date, right: Date) =>
  (left.getUTCFullYear() - right.getUTCFullYear()) * 12 +
  (left.getUTCMonth() - right.getUTCMonth());

const diffUtcYears = (left: Date, right: Date) =>
  left.getUTCFullYear() - right.getUTCFullYear();

const buildOccurrenceDateTime = (baseDay: Date, seriesStart: Date) =>
  new Date(
    Date.UTC(
      baseDay.getUTCFullYear(),
      baseDay.getUTCMonth(),
      baseDay.getUTCDate(),
      seriesStart.getUTCHours(),
      seriesStart.getUTCMinutes(),
      seriesStart.getUTCSeconds(),
      seriesStart.getUTCMilliseconds(),
    ),
  );

const overlapsWindow = (
  startAt: Date,
  endAt: Date,
  rangeStart: Date,
  rangeEnd: Date,
) => startAt.valueOf() < rangeEnd.valueOf() && endAt.valueOf() > rangeStart.valueOf();

export const parseRRule = (
  rrule: string,
  fallbackCount: number | null,
  fallbackUntilAt: string | null,
): ParsedRRule => {
  const entries = new Map(
    rrule
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, value = ''] = part.split('=');
        return [(key ?? '').toUpperCase(), value.toUpperCase()] as const;
      }),
  );

  const freq = entries.get('FREQ');
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) {
    throw new Error('RRULE must include supported FREQ');
  }

  const interval = Math.max(1, Number(entries.get('INTERVAL') ?? '1'));
  const countRaw = Number(entries.get('COUNT') ?? fallbackCount ?? NaN);
  const untilRaw = entries.get('UNTIL') ?? fallbackUntilAt;
  const byDay = (entries.get('BYDAY') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => WEEKDAY_MAP[value])
    .filter((value): value is number => Number.isInteger(value));
  const byMonthDay = (entries.get('BYMONTHDAY') ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 31);

  return {
    freq: freq as SupportedFrequency,
    interval,
    count: Number.isFinite(countRaw) && countRaw > 0 ? countRaw : null,
    untilAt: untilRaw ? new Date(untilRaw) : null,
    byDay,
    byMonthDay,
  };
};

const matchesRuleOnDay = (
  day: Date,
  seriesStart: Date,
  rule: ParsedRRule,
): boolean => {
  if (day.valueOf() < startOfUtcDay(seriesStart).valueOf()) {
    return false;
  }

  if (rule.untilAt && buildOccurrenceDateTime(day, seriesStart) > rule.untilAt) {
    return false;
  }

  switch (rule.freq) {
    case 'DAILY':
      return diffUtcDays(day, seriesStart) % rule.interval === 0;
    case 'WEEKLY': {
      const allowedDays =
        rule.byDay.length > 0 ? rule.byDay : [seriesStart.getUTCDay()];
      return (
        diffUtcWeeks(day, seriesStart) % rule.interval === 0 &&
        allowedDays.includes(day.getUTCDay())
      );
    }
    case 'MONTHLY': {
      const allowedMonthDays =
        rule.byMonthDay.length > 0 ? rule.byMonthDay : [seriesStart.getUTCDate()];
      return (
        diffUtcMonths(day, seriesStart) % rule.interval === 0 &&
        allowedMonthDays.includes(day.getUTCDate())
      );
    }
    case 'YEARLY':
      return (
        diffUtcYears(day, seriesStart) % rule.interval === 0 &&
        day.getUTCMonth() === seriesStart.getUTCMonth() &&
        day.getUTCDate() === seriesStart.getUTCDate()
      );
  }
};

export const expandEventOccurrences = (
  event: CalendarEvent,
  rangeStartIso: string,
  rangeEndIso: string,
): CalendarOccurrence[] => {
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);
  const eventStart = new Date(event.startAt);
  const eventEnd = new Date(event.endAt);
  const durationMs = eventEnd.valueOf() - eventStart.valueOf();

  if (!event.recurrence) {
    if (!overlapsWindow(eventStart, eventEnd, rangeStart, rangeEnd)) {
      return [];
    }

    return [
      {
        occurrenceId: `${event.id}:${event.startAt}`,
        eventId: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        status: event.status,
        source: event.source,
        isRecurring: false,
      },
    ];
  }

  const seriesStart = new Date(event.recurrence.seriesStartsAt);
  const rule = parseRRule(
    event.recurrence.rrule,
    event.recurrence.count,
    event.recurrence.untilAt,
  );
  const excludedStarts = new Set(
    (event.recurrence.exdates ?? []).map((value) => new Date(value).toISOString()),
  );
  const occurrences: CalendarOccurrence[] = [];
  let matchedCount = 0;
  const cursorStart = startOfUtcDay(seriesStart);
  const cursorEnd = startOfUtcDay(rangeEnd);

  for (
    let cursor = new Date(cursorStart);
    cursor.valueOf() <= cursorEnd.valueOf() && matchedCount < 5000;
    cursor = addUtcDays(cursor, 1)
  ) {
    if (!matchesRuleOnDay(cursor, seriesStart, rule)) {
      continue;
    }

    matchedCount += 1;
    if (rule.count && matchedCount > rule.count) {
      break;
    }

    const occurrenceStart = buildOccurrenceDateTime(cursor, seriesStart);
    const occurrenceEnd = new Date(occurrenceStart.valueOf() + durationMs);
    if (excludedStarts.has(occurrenceStart.toISOString())) {
      continue;
    }
    if (!overlapsWindow(occurrenceStart, occurrenceEnd, rangeStart, rangeEnd)) {
      continue;
    }

    occurrences.push({
      occurrenceId: `${event.id}:${occurrenceStart.toISOString()}`,
      eventId: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startAt: occurrenceStart.toISOString(),
      endAt: occurrenceEnd.toISOString(),
      timezone: event.timezone,
      status: event.status,
      source: event.source,
      isRecurring: true,
    });
  }

  return occurrences;
};

export const buildReminderOccurrences = (
  event: CalendarEvent,
  rangeStartIso: string,
  rangeEndIso: string,
  nowIso: string,
): CalendarReminderOccurrence[] => {
  const occurrences = expandEventOccurrences(event, rangeStartIso, rangeEndIso);
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);
  const now = new Date(nowIso);

  return occurrences.flatMap((occurrence) => {
    const occurrenceStart = new Date(occurrence.startAt);
    const occurrenceEnd = new Date(occurrence.endAt);

    return event.reminders
      .filter((reminder) => reminder.isEnabled)
      .map((reminder) => {
        const remindAt = addMinutes(
          occurrenceStart,
          -reminder.minutesBeforeStart,
        );
        if (
          remindAt.valueOf() < rangeStart.valueOf() ||
          remindAt.valueOf() > rangeEnd.valueOf()
        ) {
          return null;
        }

        const status: CalendarReminderStatus =
          remindAt.valueOf() <= now.valueOf() &&
          occurrenceEnd.valueOf() >= now.valueOf()
            ? 'due'
            : 'upcoming';

        return {
          reminderId: reminder.id,
          eventId: event.id,
          occurrenceId: occurrence.occurrenceId,
          title: event.title,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          remindAt: remindAt.toISOString(),
          minutesBeforeStart: reminder.minutesBeforeStart,
          timezone: event.timezone,
          status,
        };
      })
      .filter((value): value is CalendarReminderOccurrence => value !== null);
  });
};
