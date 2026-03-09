import type {
  CalendarEvent,
  CalendarOccurrence,
  CreateCalendarEventInput,
  CreateCalendarRecurrenceRuleInput,
} from '@second-brain/types';
import { createCalendarEventInputSchema } from '@second-brain/types';

const pad = (value: number) => String(value).padStart(2, '0');

const MINUTES_IN_DAY = 24 * 60;

export type CalendarEventMode = 'all-day-single' | 'all-day-range' | 'timed';
export type ReminderPreset = 'none' | '30m' | '1h' | '1d';
export type RecurrenceKind = 'weekly' | 'yearly';
export type RecurrenceEndMode = 'never' | 'until' | 'count';
export type WeekdayToken = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type BuildEventPayloadInput = {
  title: string;
  description: string;
  mode: CalendarEventMode;
  startDay: string;
  endDay: string;
  startTime: string;
  endTime: string;
  timezone: string;
  reminderPreset: ReminderPreset;
  source: CalendarEvent['source'];
  recurrenceEnabled: boolean;
  recurrenceKind: RecurrenceKind;
  recurrenceWeekdays: WeekdayToken[];
  recurrenceEndMode: RecurrenceEndMode;
  recurrenceUntilDay: string;
  recurrenceCount: string;
};

const reminderMinutesByPreset: Record<ReminderPreset, number | null> = {
  none: null,
  '30m': 30,
  '1h': 60,
  '1d': MINUTES_IN_DAY,
};

const weekdayOrder: WeekdayToken[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const weekdayTokenByDate = (day: string): WeekdayToken => {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 'SU' : (weekdayOrder[weekday - 1] ?? 'MO');
};

const toUtcDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

const addUtcDays = (day: string, count: number) => {
  const next = toUtcDate(day);
  next.setUTCDate(next.getUTCDate() + count);
  return toInputDate(next.toISOString());
};

const toIsoFromLocalDateTime = (day: string, time: string) =>
  new Date(`${day}T${time}`).toISOString();

const buildReminderInputs = (preset: ReminderPreset) => {
  const minutesBeforeStart = reminderMinutesByPreset[preset];
  if (minutesBeforeStart === null) {
    return [];
  }

  return [{ minutesBeforeStart, isEnabled: true }];
};

const normalizeWeekdays = (weekdays: WeekdayToken[], fallbackDay: string) => {
  const normalized = Array.from(new Set(weekdays)).filter((day): day is WeekdayToken =>
    weekdayOrder.includes(day),
  );
  return normalized.length > 0 ? normalized : [weekdayTokenByDate(fallbackDay)];
};

const buildRecurrenceUntilIso = (day: string) => {
  const nextDay = addUtcDays(day, 1);
  return new Date(`${nextDay}T00:00:00.000Z`).toISOString();
};

const buildRecurrenceInput = (
  form: BuildEventPayloadInput,
  startAt: string,
): CreateCalendarRecurrenceRuleInput | null => {
  if (!form.recurrenceEnabled) {
    return null;
  }

  const parts =
    form.recurrenceKind === 'weekly'
      ? [
          'FREQ=WEEKLY',
          'INTERVAL=1',
          `BYDAY=${normalizeWeekdays(form.recurrenceWeekdays, form.startDay).join(',')}`,
        ]
      : ['FREQ=YEARLY', 'INTERVAL=1'];

  const recurrence: CreateCalendarRecurrenceRuleInput = {
    rrule: parts.join(';'),
    seriesStartsAt: startAt,
  };

  if (form.recurrenceEndMode === 'until' && form.recurrenceUntilDay) {
    recurrence.untilAt = buildRecurrenceUntilIso(form.recurrenceUntilDay);
  }

  if (form.recurrenceEndMode === 'count' && form.recurrenceCount.trim()) {
    const count = Number(form.recurrenceCount);
    if (Number.isFinite(count) && count > 0) {
      recurrence.count = Math.max(1, count);
    }
  }

  return recurrence;
};

const buildRangeEndIso = (endDay: string) => new Date(`${addUtcDays(endDay, 1)}T00:00:00.000Z`).toISOString();

export const toMonthKey = (value: Date) =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;

export const fromMonthKey = (value?: string | null) => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return new Date();
  }
  return new Date(`${value}-01T12:00:00`);
};

export const getMonthWindow = (month: Date) => {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0);
  const startDay = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startDay);

  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 42);

  return {
    gridStartIso: gridStart.toISOString(),
    gridEndIso: gridEnd.toISOString(),
    monthStartIso: new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0).toISOString(),
    monthEndIso: new Date(month.getFullYear(), month.getMonth() + 1, 1, 0, 0, 0).toISOString(),
  };
};

export const toInputDateTime = (iso: string) => {
  const value = new Date(iso);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

export const toInputDate = (iso: string) => {
  const value = new Date(iso);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

const pushOccurrenceToDay = (
  map: Map<string, CalendarOccurrence[]>,
  key: string,
  occurrence: CalendarOccurrence,
) => {
  const existing = map.get(key) ?? [];
  existing.push(occurrence);
  existing.sort((left, right) => {
    const leftAllDay = new Date(left.startAt).getUTCHours() === 0 &&
      new Date(left.endAt).valueOf() - new Date(left.startAt).valueOf() >= MINUTES_IN_DAY * 60_000;
    const rightAllDay = new Date(right.startAt).getUTCHours() === 0 &&
      new Date(right.endAt).valueOf() - new Date(right.startAt).valueOf() >= MINUTES_IN_DAY * 60_000;
    if (leftAllDay !== rightAllDay) {
      return leftAllDay ? -1 : 1;
    }
    return left.startAt.localeCompare(right.startAt);
  });
  map.set(key, existing);
};

export const groupOccurrencesByDate = (occurrences: CalendarOccurrence[]) => {
  const map = new Map<string, CalendarOccurrence[]>();

  for (const occurrence of occurrences) {
    const start = new Date(occurrence.startAt);
    const end = new Date(occurrence.endAt);
    const durationMs = end.valueOf() - start.valueOf();
    const isAllDay =
      start.getUTCHours() === 0 &&
      start.getUTCMinutes() === 0 &&
      durationMs >= MINUTES_IN_DAY * 60_000;

    if (!isAllDay) {
      pushOccurrenceToDay(
        map,
        `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`,
        occurrence,
      );
      continue;
    }

    for (
      let cursor = new Date(start);
      cursor.valueOf() < end.valueOf();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      pushOccurrenceToDay(
        map,
        `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`,
        occurrence,
      );
    }
  }

  return map;
};

export const buildEventPayload = (form: BuildEventPayloadInput) => {
  const startAt =
    form.mode === 'timed'
      ? toIsoFromLocalDateTime(form.startDay, form.startTime)
      : new Date(`${form.startDay}T00:00:00.000Z`).toISOString();
  const endAt =
    form.mode === 'timed'
      ? toIsoFromLocalDateTime(form.startDay, form.endTime)
      : buildRangeEndIso(form.mode === 'all-day-range' ? form.endDay : form.startDay);

  const payload: CreateCalendarEventInput = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    location: null,
    startAt,
    endAt,
    timezone: form.timezone,
    isAllDay: form.mode !== 'timed',
    source: form.source,
    status: 'confirmed',
    externalReference: null,
    rawPayload: null,
    recurrence:
      form.mode === 'all-day-range'
        ? null
        : buildRecurrenceInput(
            {
              ...form,
              recurrenceKind:
                form.mode === 'timed' ? 'weekly' : form.recurrenceKind,
            },
            startAt,
          ),
    reminders: buildReminderInputs(form.reminderPreset),
  };

  return createCalendarEventInputSchema.parse(payload);
};

export const getAgendaOccurrences = (
  occurrences: CalendarOccurrence[],
  limit = 12,
) =>
  [...occurrences]
    .sort((left, right) => left.startAt.localeCompare(right.startAt))
    .slice(0, limit);

export const getEventByOccurrence = (
  events: CalendarEvent[],
  occurrence: CalendarOccurrence | null,
) => {
  if (!occurrence) {
    return null;
  }
  return events.find((event) => event.id === occurrence.eventId) ?? null;
};
