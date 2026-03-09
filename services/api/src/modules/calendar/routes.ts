import { createDbClient, sql } from '@second-brain/db';
import type {
  CalendarEvent,
  CalendarEventsWindowResponse,
  CalendarOccurrence,
  CalendarReminder,
  CalendarReminderWindowResponse,
  CalendarReminderOccurrence,
  CalendarRecurrenceRule,
  CalendarSummaryDay,
  CalendarSummaryResponse,
  CreateCalendarEventInput,
} from '@second-brain/types';
import {
  calendarReminderStatusSchema,
  createCalendarEventInputSchema,
  updateCalendarEventInputSchema,
} from '@second-brain/types';
import type { Elysia } from 'elysia';
import { ApiHttpError } from '../../lib/errors';
import {
  buildReminderOccurrences,
  expandEventOccurrences,
  parseRRule,
} from './recurrence';

type EventRow = Record<string, unknown>;

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);

const toNullableIso = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }
  return toIso(value);
};

const toNullableString = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
};

const normalizeJson = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
};

const validateWindow = (fromRaw: unknown, toRaw: unknown) => {
  const from = String(fromRaw ?? '');
  const to = String(toRaw ?? '');
  if (!from || !to || Number.isNaN(new Date(from).valueOf()) || Number.isNaN(new Date(to).valueOf())) {
    throw new ApiHttpError(
      400,
      'VALIDATION_ERROR',
      'from and to must be valid ISO datetimes',
    );
  }
  if (new Date(to).valueOf() <= new Date(from).valueOf()) {
    throw new ApiHttpError(
      400,
      'VALIDATION_ERROR',
      'to must be after from',
    );
  }
  return { from, to };
};

const validateReferenceAt = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString();
  }

  const parsed = String(value);
  if (Number.isNaN(new Date(parsed).valueOf())) {
    throw new ApiHttpError(400, 'VALIDATION_ERROR', 'at must be a valid ISO datetime');
  }

  return parsed;
};

const getZonedParts = (value: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: String(parts.weekday),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

const getTimeZoneOffsetMs = (value: Date, timeZone: string) => {
  const parts = getZonedParts(value, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - value.getTime();
};

const zonedTimeToUtc = (
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const resolved = new Date(utcGuess.getTime() - offset);
  const resolvedOffset = getTimeZoneOffsetMs(resolved, timeZone);
  return new Date(utcGuess.getTime() - resolvedOffset);
};

const buildTodayWindow = (referenceIso: string, timeZone: string) => {
  const reference = new Date(referenceIso);
  const parts = getZonedParts(reference, timeZone);
  const start = zonedTimeToUtc(timeZone, parts.year, parts.month, parts.day, 0, 0, 0);
  const end = zonedTimeToUtc(timeZone, parts.year, parts.month, parts.day + 1, 0, 0, 0);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
};

const buildWeekWindow = (referenceIso: string, timeZone: string) => {
  const reference = new Date(referenceIso);
  const parts = getZonedParts(reference, timeZone);
  const weekdayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
    parts.weekday,
  );
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  localDate.setUTCDate(localDate.getUTCDate() - (weekdayIndex < 0 ? 0 : weekdayIndex));

  const start = zonedTimeToUtc(
    timeZone,
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate(),
    0,
    0,
    0,
  );
  const endLocalDate = new Date(localDate);
  endLocalDate.setUTCDate(endLocalDate.getUTCDate() + 7);
  const end = zonedTimeToUtc(
    timeZone,
    endLocalDate.getUTCFullYear(),
    endLocalDate.getUTCMonth() + 1,
    endLocalDate.getUTCDate(),
    0,
    0,
    0,
  );

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
};

const buildSummaryDays = (occurrences: CalendarOccurrence[]): CalendarSummaryDay[] => {
  const days = new Map<string, CalendarOccurrence[]>();

  for (const occurrence of occurrences) {
    const start = new Date(occurrence.startAt);
    const end = new Date(occurrence.endAt);
    const isAllDay =
      start.getUTCHours() === 0 &&
      start.getUTCMinutes() === 0 &&
      end.valueOf() - start.valueOf() >= 86_400_000;

    if (!isAllDay) {
      const key = start.toISOString().slice(0, 10);
      const existing = days.get(key) ?? [];
      existing.push(occurrence);
      existing.sort((left, right) => left.startAt.localeCompare(right.startAt));
      days.set(key, existing);
      continue;
    }

    for (
      let cursor = new Date(start);
      cursor.valueOf() < end.valueOf();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const key = cursor.toISOString().slice(0, 10);
      const existing = days.get(key) ?? [];
      existing.push(occurrence);
      existing.sort((left, right) => left.startAt.localeCompare(right.startAt));
      days.set(key, existing);
    }
  }

  return [...days.entries()].map(([date, grouped]) => ({
    date,
    occurrences: grouped,
  }));
};

const buildSummaryStats = (occurrences: CalendarOccurrence[]) => ({
  totalOccurrences: occurrences.length,
  allDayOccurrences: occurrences.filter((occurrence) => {
    const start = new Date(occurrence.startAt);
    const end = new Date(occurrence.endAt);
    return start.getUTCHours() === 0 && end.valueOf() - start.valueOf() >= 86_400_000;
  }).length,
  timedOccurrences: occurrences.filter((occurrence) => {
    const start = new Date(occurrence.startAt);
    const end = new Date(occurrence.endAt);
    return !(start.getUTCHours() === 0 && end.valueOf() - start.valueOf() >= 86_400_000);
  }).length,
  recurringOccurrences: occurrences.filter((occurrence) => occurrence.isRecurring).length,
  oneTimeOccurrences: occurrences.filter((occurrence) => !occurrence.isRecurring).length,
});

const getActiveOccurrences = async (
  databaseUrl: string,
  from: string,
  to: string,
) => {
  const events = await fetchCalendarEvents(databaseUrl);
  const activeEvents = events.filter((event) => event.status !== 'cancelled');
  const occurrences = activeEvents
    .flatMap((event) => expandEventOccurrences(event, from, to))
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  return { activeEvents, occurrences };
};

const serializeReminder = (row: EventRow): CalendarReminder => ({
  id: String(row.id),
  eventId: String(row.eventId),
  minutesBeforeStart: Number(row.minutesBeforeStart),
  isEnabled: Boolean(row.isEnabled),
  createdAt: toIso(row.createdAt),
});

const serializeRecurrence = (row: EventRow): CalendarRecurrenceRule => ({
  id: String(row.id),
  eventId: String(row.eventId),
  rrule: String(row.rrule),
  seriesStartsAt: toIso(row.seriesStartsAt),
  untilAt: toNullableIso(row.untilAt),
  count:
    row.count === null || row.count === undefined ? null : Number(row.count),
  exdates: Array.isArray(row.exdates) ? row.exdates.map((value) => toIso(value)) : [],
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const serializeEvent = (
  row: EventRow,
  reminders: CalendarReminder[],
  recurrence: CalendarRecurrenceRule | null,
): CalendarEvent => ({
  id: String(row.id),
  uid: String(row.uid),
  title: String(row.title),
  description: toNullableString(row.description),
  location: toNullableString(row.location),
  dtstamp: toIso(row.dtstamp),
  sequence: Number(row.sequence),
  startAt: toIso(row.startAt),
  endAt: toIso(row.endAt),
  timezone: String(row.timezone),
  isAllDay: Boolean(row.isAllDay),
  status: String(row.status) as CalendarEvent['status'],
  source: String(row.source) as CalendarEvent['source'],
  externalReference: toNullableString(row.externalReference),
  rawPayload: normalizeJson(row.rawPayload),
  recurrence,
  reminders,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const fetchCalendarEvents = async (databaseUrl: string) => {
  const { db } = createDbClient(databaseUrl);
  const [eventRows, recurrenceRows, reminderRows] = await Promise.all([
    db.execute(sql`
      select
        id,
        uid,
        title,
        description,
        location,
        dtstamp,
        sequence,
        start_at as "startAt",
        end_at as "endAt",
        timezone,
        is_all_day as "isAllDay",
        status,
        source,
        external_reference as "externalReference",
        raw_payload as "rawPayload",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from calendar.events
      order by start_at asc
    `),
    db.execute(sql`
      select
        id,
        event_id as "eventId",
        rrule,
        series_starts_at as "seriesStartsAt",
        until_at as "untilAt",
        count,
        coalesce((
          select array_agg(excluded_at order by excluded_at asc)
          from calendar.event_recurrence_exdates exdates
          where exdates.event_id = calendar.event_recurrence_rules.event_id
        ), '{}'::timestamptz[]) as exdates,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from calendar.event_recurrence_rules
    `),
    db.execute(sql`
      select
        id,
        event_id as "eventId",
        minutes_before_start as "minutesBeforeStart",
        is_enabled as "isEnabled",
        created_at as "createdAt"
      from calendar.event_reminders
      order by minutes_before_start asc
    `),
  ]);

  const remindersByEventId = new Map<string, CalendarReminder[]>();
  for (const row of reminderRows) {
    const reminder = serializeReminder(row as EventRow);
    const existing = remindersByEventId.get(reminder.eventId) ?? [];
    existing.push(reminder);
    remindersByEventId.set(reminder.eventId, existing);
  }

  const recurrenceByEventId = new Map<string, CalendarRecurrenceRule>();
  for (const row of recurrenceRows) {
    const recurrence = serializeRecurrence(row as EventRow);
    recurrenceByEventId.set(recurrence.eventId, recurrence);
  }

  return eventRows.map((row) =>
    serializeEvent(
      row as EventRow,
      remindersByEventId.get(String((row as EventRow).id)) ?? [],
      recurrenceByEventId.get(String((row as EventRow).id)) ?? null,
    ),
  );
};

const getCalendarEventOrThrow = async (databaseUrl: string, eventId: string) => {
  const events = await fetchCalendarEvents(databaseUrl);
  const event = events.find((item) => item.id === eventId);
  if (!event) {
    throw new ApiHttpError(404, 'CALENDAR_EVENT_NOT_FOUND', 'Calendar event not found');
  }
  return event;
};

const ensureRRuleIsParsable = (
  recurrence: CreateCalendarEventInput['recurrence'],
) => {
  if (!recurrence) {
    return;
  }
  try {
    parseRRule(recurrence.rrule, recurrence.count ?? null, recurrence.untilAt ?? null);
  } catch (error) {
    throw new ApiHttpError(
      400,
      'VALIDATION_ERROR',
      error instanceof Error ? error.message : 'Invalid recurrence rule',
    );
  }
};

const insertReminders = async (
  databaseUrl: string,
  eventId: string,
  reminders: CreateCalendarEventInput['reminders'],
) => {
  if (reminders.length === 0) {
    return;
  }
  const { db } = createDbClient(databaseUrl);
  for (const reminder of reminders) {
    await db.execute(sql`
      insert into calendar.event_reminders (
        event_id,
        minutes_before_start,
        is_enabled
      ) values (
        ${eventId},
        ${reminder.minutesBeforeStart},
        ${reminder.isEnabled}
      )
    `);
  }
};

const replaceRecurrenceExdates = async (
  databaseUrl: string,
  eventId: string,
  exdates: string[],
) => {
  const { db } = createDbClient(databaseUrl);
  await db.execute(sql`
    delete from calendar.event_recurrence_exdates
    where event_id = ${eventId}
  `);

  for (const exdate of exdates) {
    await db.execute(sql`
      insert into calendar.event_recurrence_exdates (
        event_id,
        excluded_at
      ) values (
        ${eventId},
        ${exdate}
      )
    `);
  }
};

const replaceReminders = async (
  databaseUrl: string,
  eventId: string,
  reminders: CreateCalendarEventInput['reminders'],
) => {
  const { db } = createDbClient(databaseUrl);
  await db.execute(sql`
    delete from calendar.event_reminders
    where event_id = ${eventId}
  `);
  await insertReminders(databaseUrl, eventId, reminders);
};

const upsertRecurrence = async (
  databaseUrl: string,
  eventId: string,
  recurrence: CreateCalendarEventInput['recurrence'],
  fallbackStartAt: string,
) => {
  const { db } = createDbClient(databaseUrl);

  if (!recurrence) {
    await db.execute(sql`
      delete from calendar.event_recurrence_rules
      where event_id = ${eventId}
    `);
    await db.execute(sql`
      delete from calendar.event_recurrence_exdates
      where event_id = ${eventId}
    `);
    return;
  }

  const seriesStartsAt = recurrence.seriesStartsAt ?? fallbackStartAt;
  await db.execute(sql`
    insert into calendar.event_recurrence_rules (
      event_id,
      rrule,
      series_starts_at,
      until_at,
      count,
      updated_at
    ) values (
      ${eventId},
      ${recurrence.rrule},
      ${seriesStartsAt},
      ${recurrence.untilAt ?? null},
      ${recurrence.count ?? null},
      now()
    )
    on conflict (event_id) do update set
      rrule = excluded.rrule,
      series_starts_at = excluded.series_starts_at,
      until_at = excluded.until_at,
      count = excluded.count,
      updated_at = now()
  `);

  await replaceRecurrenceExdates(databaseUrl, eventId, recurrence.exdates ?? []);
};

export const registerCalendarRoutes = (
  app: Elysia,
  databaseUrl: string,
  options?: {
    defaultTimezone?: string;
  },
) => {
  const defaultTimezone = options?.defaultTimezone ?? 'Europe/Madrid';
  const { db } = createDbClient(databaseUrl);

  app.get('/calendar/events', async ({ query }): Promise<CalendarEventsWindowResponse> => {
    const { from, to } = validateWindow(query.from, query.to);
    const { activeEvents, occurrences } = await getActiveOccurrences(databaseUrl, from, to);

    const eventIds = new Set(occurrences.map((occurrence) => occurrence.eventId));

    return {
      windowStart: from,
      windowEnd: to,
      timezone: defaultTimezone,
      events: activeEvents.filter((event) => eventIds.has(event.id)),
      occurrences,
    };
  });

  app.get('/calendar/summary/today', async ({ query }): Promise<CalendarSummaryResponse> => {
    const at = validateReferenceAt(query.at);
    const { from, to } = buildTodayWindow(at, defaultTimezone);
    const { occurrences } = await getActiveOccurrences(databaseUrl, from, to);

    return {
      windowStart: from,
      windowEnd: to,
      timezone: defaultTimezone,
      days: buildSummaryDays(occurrences),
      stats: buildSummaryStats(occurrences),
    };
  });

  app.get('/calendar/summary/week', async ({ query }): Promise<CalendarSummaryResponse> => {
    const at = validateReferenceAt(query.at);
    const { from, to } = buildWeekWindow(at, defaultTimezone);
    const { occurrences } = await getActiveOccurrences(databaseUrl, from, to);

    return {
      windowStart: from,
      windowEnd: to,
      timezone: defaultTimezone,
      days: buildSummaryDays(occurrences),
      stats: buildSummaryStats(occurrences),
    };
  });

  app.get('/calendar/events/:id', async ({ params }) => {
    return getCalendarEventOrThrow(databaseUrl, params.id);
  });

  app.post('/calendar/events', async ({ body, set }) => {
    const parsed = createCalendarEventInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Invalid calendar event input', parsed.error.flatten());
    }

    ensureRRuleIsParsable(parsed.data.recurrence ?? null);

    const uid = crypto.randomUUID();
    const dtstamp = new Date().toISOString();
    const [created] = await db.execute(sql`
      insert into calendar.events (
        uid,
        title,
        description,
        location,
        dtstamp,
        sequence,
        start_at,
        end_at,
        timezone,
        is_all_day,
        status,
        source,
        external_reference,
        raw_payload
      ) values (
        ${uid},
        ${parsed.data.title},
        ${parsed.data.description ?? null},
        ${parsed.data.location ?? null},
        ${dtstamp},
        ${0},
        ${parsed.data.startAt},
        ${parsed.data.endAt},
        ${parsed.data.timezone},
        ${parsed.data.isAllDay},
        ${parsed.data.status},
        ${parsed.data.source},
        ${parsed.data.externalReference ?? null},
        ${parsed.data.rawPayload ?? null}
      )
      returning id
    `);

    const eventId = String((created as EventRow).id);
    await upsertRecurrence(
      databaseUrl,
      eventId,
      parsed.data.recurrence ?? null,
      parsed.data.startAt,
    );
    await insertReminders(databaseUrl, eventId, parsed.data.reminders);

    set.status = 201;
    return getCalendarEventOrThrow(databaseUrl, eventId);
  });

  app.patch('/calendar/events/:id', async ({ body, params }) => {
    const current = await getCalendarEventOrThrow(databaseUrl, params.id);
    const parsed = updateCalendarEventInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Invalid calendar event input', parsed.error.flatten());
    }

    const merged: CreateCalendarEventInput = {
      title: parsed.data.title ?? current.title,
      description:
        parsed.data.description === undefined
          ? current.description
          : parsed.data.description,
      location:
        parsed.data.location === undefined ? current.location : parsed.data.location,
      startAt: parsed.data.startAt ?? current.startAt,
      endAt: parsed.data.endAt ?? current.endAt,
      timezone: parsed.data.timezone ?? current.timezone,
      isAllDay: parsed.data.isAllDay ?? current.isAllDay,
      source: parsed.data.source ?? current.source,
      status: parsed.data.status ?? current.status,
      externalReference:
        parsed.data.externalReference === undefined
          ? current.externalReference
          : parsed.data.externalReference,
      rawPayload:
        parsed.data.rawPayload === undefined
          ? current.rawPayload
          : parsed.data.rawPayload,
      recurrence:
        parsed.data.recurrence === undefined
          ? current.recurrence
            ? {
                rrule: current.recurrence.rrule,
                seriesStartsAt: current.recurrence.seriesStartsAt,
                untilAt: current.recurrence.untilAt,
                count: current.recurrence.count,
                exdates: current.recurrence.exdates,
              }
            : null
          : parsed.data.recurrence,
      reminders:
        parsed.data.reminders === undefined
          ? current.reminders.map((reminder) => ({
              minutesBeforeStart: reminder.minutesBeforeStart,
              isEnabled: reminder.isEnabled,
            }))
          : parsed.data.reminders,
    };

    const validatedMerged = createCalendarEventInputSchema.safeParse(merged);
    if (!validatedMerged.success) {
      throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Invalid calendar event input', validatedMerged.error.flatten());
    }

    ensureRRuleIsParsable(validatedMerged.data.recurrence ?? null);

    await db.execute(sql`
      update calendar.events
      set
        title = ${validatedMerged.data.title},
        description = ${validatedMerged.data.description ?? null},
        location = ${validatedMerged.data.location ?? null},
        dtstamp = now(),
        sequence = sequence + 1,
        start_at = ${validatedMerged.data.startAt},
        end_at = ${validatedMerged.data.endAt},
        timezone = ${validatedMerged.data.timezone},
        is_all_day = ${validatedMerged.data.isAllDay},
        status = ${validatedMerged.data.status},
        source = ${validatedMerged.data.source},
        external_reference = ${validatedMerged.data.externalReference ?? null},
        raw_payload = ${validatedMerged.data.rawPayload ?? null},
        updated_at = now()
      where id = ${params.id}
    `);

    await upsertRecurrence(
      databaseUrl,
      params.id,
      validatedMerged.data.recurrence ?? null,
      validatedMerged.data.startAt,
    );
    await replaceReminders(databaseUrl, params.id, validatedMerged.data.reminders);

    return getCalendarEventOrThrow(databaseUrl, params.id);
  });

  app.delete('/calendar/events/:id', async ({ params, set }) => {
    await getCalendarEventOrThrow(databaseUrl, params.id);
    await db.execute(sql`
      delete from calendar.events
      where id = ${params.id}
    `);
    set.status = 204;
    return null;
  });

  app.get('/calendar/reminders', async ({ query }): Promise<CalendarReminderWindowResponse> => {
    const { from, to } = validateWindow(query.from, query.to);
    const statusRaw = query.status === undefined ? undefined : String(query.status);
    const status =
      statusRaw === undefined
        ? null
        : calendarReminderStatusSchema.safeParse(statusRaw).success
          ? statusRaw
          : (() => {
              throw new ApiHttpError(
                400,
                'VALIDATION_ERROR',
                'status must be due or upcoming',
              );
            })();

    const reminders = (await fetchCalendarEvents(databaseUrl))
      .filter((event) => event.status !== 'cancelled')
      .flatMap((event) => buildReminderOccurrences(event, from, to, new Date().toISOString()))
      .filter((reminder) => (status ? reminder.status === status : true))
      .sort((left, right) => left.remindAt.localeCompare(right.remindAt));

    return {
      windowStart: from,
      windowEnd: to,
      timezone: defaultTimezone,
      reminders,
    };
  });
};
