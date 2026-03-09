import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ApiHttpError } from '../src/lib/errors';

const eventId = '30000000-0000-4000-8000-000000000001';
const recurrenceId = '30000000-0000-4000-8000-000000000002';
const reminderId = '30000000-0000-4000-8000-000000000003';

type EventRow = {
  id: string;
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  dtstamp: Date;
  sequence: number;
  startAt: Date;
  endAt: Date;
  timezone: string;
  isAllDay: boolean;
  status: string;
  source: string;
  externalReference: string | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type RecurrenceRow = {
  id: string;
  eventId: string;
  rrule: string;
  seriesStartsAt: Date;
  untilAt: Date | null;
  count: number | null;
  exdates: Date[];
  createdAt: Date;
  updatedAt: Date;
};

type ReminderRow = {
  id: string;
  eventId: string;
  minutesBeforeStart: number;
  isEnabled: boolean;
  createdAt: Date;
};

const state: {
  events: EventRow[];
  recurrences: RecurrenceRow[];
  reminders: ReminderRow[];
} = {
  events: [],
  recurrences: [],
  reminders: [],
};

beforeEach(() => {
  state.events = [
    {
      id: eventId,
      uid: 'dentist@example.second-brain',
      title: 'Dentist',
      description: 'Check-up',
      location: 'Clinic',
      dtstamp: new Date('2026-03-01T10:00:00.000Z'),
      sequence: 0,
      startAt: new Date('2026-03-09T16:00:00.000Z'),
      endAt: new Date('2026-03-09T17:00:00.000Z'),
      timezone: 'Europe/Madrid',
      isAllDay: false,
      status: 'confirmed',
      source: 'ai',
      externalReference: 'openclaw-1',
      rawPayload: { originalText: 'Dentist next Monday at 17:00' },
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    },
  ];
  state.recurrences = [
    {
      id: recurrenceId,
      eventId,
      rrule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=3',
      seriesStartsAt: new Date('2026-03-09T16:00:00.000Z'),
      untilAt: null,
      count: 3,
      exdates: [],
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    },
  ];
  state.reminders = [
    {
      id: reminderId,
      eventId,
      minutesBeforeStart: 30,
      isEnabled: true,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
    },
  ];
});

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    db: {
      execute: async (query?: { text?: string; values?: unknown[] }) => {
        const text = query?.text ?? '';
        const values = query?.values ?? [];

        if (text.includes('from calendar.events')) {
          return state.events;
        }
        if (text.includes('from calendar.event_recurrence_rules')) {
          return state.recurrences;
        }
        if (text.includes('from calendar.event_reminders')) {
          return state.reminders;
        }
        if (text.includes('insert into calendar.events')) {
          const row: EventRow = {
            id: '30000000-0000-4000-8000-000000000010',
            uid: String(values[0]),
            title: String(values[1]),
            description: (values[2] as string | null) ?? null,
            location: (values[3] as string | null) ?? null,
            dtstamp: new Date(String(values[4])),
            sequence: Number(values[5]),
            startAt: new Date(String(values[6])),
            endAt: new Date(String(values[7])),
            timezone: String(values[8]),
            isAllDay: Boolean(values[9]),
            status: String(values[10]),
            source: String(values[11]),
            externalReference: (values[12] as string | null) ?? null,
            rawPayload: (values[13] as Record<string, unknown> | null) ?? null,
            createdAt: new Date('2026-03-01T12:00:00.000Z'),
            updatedAt: new Date('2026-03-01T12:00:00.000Z'),
          };
          state.events.push(row);
          return [{ id: row.id }];
        }
        if (text.includes('insert into calendar.event_recurrence_rules')) {
          const existing = state.recurrences.find(
            (item) => item.eventId === String(values[0]),
          );
          const next = {
            id: existing?.id ?? '30000000-0000-4000-8000-000000000011',
            eventId: String(values[0]),
            rrule: String(values[1]),
            seriesStartsAt: new Date(String(values[2])),
            untilAt: values[3] ? new Date(String(values[3])) : null,
            count: values[4] === null ? null : Number(values[4]),
            exdates: existing?.exdates ?? [],
            createdAt: existing?.createdAt ?? new Date('2026-03-01T12:00:00.000Z'),
            updatedAt: new Date('2026-03-01T12:00:00.000Z'),
          };
          state.recurrences = [
            ...state.recurrences.filter((item) => item.eventId !== next.eventId),
            next,
          ];
          return [];
        }
        if (text.includes('insert into calendar.event_recurrence_exdates')) {
          const existing = state.recurrences.find(
            (item) => item.eventId === String(values[0]),
          );
          if (existing) {
            existing.exdates = [...existing.exdates, new Date(String(values[1]))];
          }
          return [];
        }
        if (text.includes('delete from calendar.event_recurrence_exdates')) {
          state.recurrences = state.recurrences.map((item) =>
            item.eventId === String(values[0]) ? { ...item, exdates: [] } : item,
          );
          return [];
        }
        if (text.includes('insert into calendar.event_reminders')) {
          state.reminders.push({
            id: `${reminderId}-${state.reminders.length + 1}`,
            eventId: String(values[0]),
            minutesBeforeStart: Number(values[1]),
            isEnabled: Boolean(values[2]),
            createdAt: new Date('2026-03-01T12:00:00.000Z'),
          });
          return [];
        }
        if (text.includes('delete from calendar.event_reminders')) {
          state.reminders = state.reminders.filter(
            (item) => item.eventId !== String(values[0]),
          );
          return [];
        }
        if (text.includes('delete from calendar.event_recurrence_rules')) {
          state.recurrences = state.recurrences.filter(
            (item) => item.eventId !== String(values[0]),
          );
          return [];
        }
        if (text.includes('update calendar.events')) {
          state.events = state.events.map((item) =>
            item.id === String(values[11])
              ? {
                  ...item,
                  title: String(values[0]),
                  description: (values[1] as string | null) ?? null,
                  location: (values[2] as string | null) ?? null,
                  sequence: item.sequence + 1,
                  dtstamp: new Date('2026-03-01T13:00:00.000Z'),
                  startAt: new Date(String(values[3])),
                  endAt: new Date(String(values[4])),
                  timezone: String(values[5]),
                  isAllDay: Boolean(values[6]),
                  status: String(values[7]),
                  source: String(values[8]),
                  externalReference: (values[9] as string | null) ?? null,
                  rawPayload: (values[10] as Record<string, unknown> | null) ?? null,
                  updatedAt: new Date('2026-03-01T13:00:00.000Z'),
                }
              : item,
          );
          return [];
        }
        if (text.includes('delete from calendar.events')) {
          state.events = state.events.filter((item) => item.id !== String(values[0]));
          state.recurrences = state.recurrences.filter(
            (item) => item.eventId !== String(values[0]),
          );
          state.reminders = state.reminders.filter(
            (item) => item.eventId !== String(values[0]),
          );
          return [];
        }

        return [];
      },
    },
  });

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  });

  return { createDbClient, sql };
});

const { registerCalendarRoutes } = await import('../src/modules/calendar/routes');

const buildApp = () => {
  const app = new Elysia();
  app.onError(({ error, set }) => {
    if (error instanceof ApiHttpError) {
      set.status = error.status;
      return error.body;
    }
    set.status = 500;
    return {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected server error',
    };
  });
  registerCalendarRoutes(app, 'postgres://ignored', {
    defaultTimezone: 'Europe/Madrid',
  });
  return app;
};

describe('calendar routes', () => {
  test('lists expanded recurring occurrences', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request(
        'http://local/calendar/events?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.000Z',
      ),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      events: Array<{ id: string }>;
      occurrences: Array<{ occurrenceId: string }>;
    };
    expect(body.events).toHaveLength(1);
    expect(body.occurrences).toHaveLength(3);
  });

  test('creates a new manual event', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request('http://local/calendar/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Boarding',
          startAt: '2026-03-10T08:00:00.000Z',
          endAt: '2026-03-10T09:00:00.000Z',
          timezone: 'Europe/Madrid',
          reminders: [{ minutesBeforeStart: 45 }],
        }),
      }),
    );
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      title: string;
      uid: string;
      sequence: number;
      reminders: unknown[];
    };
    expect(body.title).toBe('Boarding');
    expect(body.uid.length > 0).toBe(true);
    expect(body.sequence).toBe(0);
    expect(body.reminders).toHaveLength(1);
  });

  test('returns reminder occurrences', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request(
        'http://local/calendar/reminders?from=2026-03-09T00:00:00.000Z&to=2026-03-31T23:59:59.000Z',
      ),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      reminders: Array<{ title: string; minutesBeforeStart: number }>;
    };
    expect(body.reminders).toHaveLength(3);
    expect(body.reminders[0]?.title).toBe('Dentist');
  });

  test('returns today summary for AI clients', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request(
        'http://local/calendar/summary/today?at=2026-03-09T10:00:00.000Z',
      ),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      days: Array<{ date: string; occurrences: Array<{ title: string }> }>;
      stats: { totalOccurrences: number; recurringOccurrences: number };
    };
    expect(body.days[0]?.date).toBe('2026-03-09');
    expect(body.days[0]?.occurrences[0]?.title).toBe('Dentist');
    expect(body.stats.totalOccurrences).toBe(1);
    expect(body.stats.recurringOccurrences).toBe(1);
  });

  test('returns week summary for AI clients', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request(
        'http://local/calendar/summary/week?at=2026-03-09T10:00:00.000Z',
      ),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      days: Array<{ date: string; occurrences: Array<{ title: string }> }>;
      stats: { totalOccurrences: number };
    };
    expect(body.days).toHaveLength(1);
    expect(body.days[0]?.occurrences[0]?.title).toBe('Dentist');
    expect(body.stats.totalOccurrences).toBe(1);
  });
});
