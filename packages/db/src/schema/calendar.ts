import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const calendarSchema = pgSchema('calendar');

export const calendarEvents = calendarSchema.table(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: varchar('uid', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    location: varchar('location', { length: 255 }),
    dtstamp: timestamp('dtstamp', { withTimezone: true }).notNull().defaultNow(),
    sequence: integer('sequence').notNull().default(0),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    timezone: varchar('timezone', { length: 64 })
      .notNull()
      .default('Europe/Madrid'),
    isAllDay: boolean('is_all_day').notNull().default(false),
    status: varchar('status', { length: 16 }).notNull().default('confirmed'),
    source: varchar('source', { length: 16 }).notNull().default('manual'),
    externalReference: varchar('external_reference', { length: 255 }),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uidIdx: index('calendar_events_uid_idx').on(table.uid),
    startIdx: index('calendar_events_start_idx').on(table.startAt),
    statusStartIdx: index('calendar_events_status_start_idx').on(
      table.status,
      table.startAt,
    ),
    externalReferenceIdx: index('calendar_events_external_reference_idx').on(
      table.externalReference,
    ),
  }),
);

export const calendarEventRecurrenceRules = calendarSchema.table(
  'event_recurrence_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    rrule: text('rrule').notNull(),
    seriesStartsAt: timestamp('series_starts_at', { withTimezone: true }).notNull(),
    untilAt: timestamp('until_at', { withTimezone: true }),
    count: integer('count'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventIdx: index('calendar_event_recurrence_rules_event_idx').on(
      table.eventId,
    ),
  }),
);

export const calendarEventReminders = calendarSchema.table(
  'event_reminders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    minutesBeforeStart: integer('minutes_before_start').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventIdx: index('calendar_event_reminders_event_idx').on(table.eventId),
    minutesIdx: index('calendar_event_reminders_minutes_idx').on(
      table.minutesBeforeStart,
    ),
    eventMinutesFk: foreignKey({
      columns: [table.eventId],
      foreignColumns: [calendarEvents.id],
      name: 'calendar_event_reminders_event_id_fkey',
    }).onDelete('cascade'),
  }),
);

export const calendarEventRecurrenceExdates = calendarSchema.table(
  'event_recurrence_exdates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    excludedAt: timestamp('excluded_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventIdx: index('calendar_event_recurrence_exdates_event_idx').on(table.eventId),
    eventExcludedAtIdx: index('calendar_event_recurrence_exdates_event_excluded_at_idx').on(
      table.eventId,
      table.excludedAt,
    ),
  }),
);
