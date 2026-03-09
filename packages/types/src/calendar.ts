import { z } from 'zod';

const isoDateTimeSchema = z.string().datetime({ offset: true });

const timezoneSchema = z.string().min(1).default('Europe/Madrid');

export const calendarEventSourceSchema = z.enum(['manual', 'ai']);
export type CalendarEventSource = z.infer<typeof calendarEventSourceSchema>;

export const calendarEventStatusSchema = z.enum(['confirmed', 'cancelled']);
export type CalendarEventStatus = z.infer<typeof calendarEventStatusSchema>;

export const calendarReminderSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  minutesBeforeStart: z.number().int().min(0).max(43200),
  isEnabled: z.boolean(),
  createdAt: z.string(),
});
export type CalendarReminder = z.infer<typeof calendarReminderSchema>;

export const calendarRecurrenceRuleSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  rrule: z.string().min(1),
  seriesStartsAt: isoDateTimeSchema,
  untilAt: isoDateTimeSchema.nullable(),
  count: z.number().int().positive().nullable(),
  exdates: z.array(isoDateTimeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CalendarRecurrenceRule = z.infer<
  typeof calendarRecurrenceRuleSchema
>;

export const calendarEventSchema = z.object({
  id: z.string().uuid(),
  uid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  location: z.string().nullable(),
  dtstamp: isoDateTimeSchema,
  sequence: z.number().int().nonnegative(),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  timezone: timezoneSchema,
  isAllDay: z.boolean(),
  status: calendarEventStatusSchema,
  source: calendarEventSourceSchema,
  externalReference: z.string().nullable(),
  rawPayload: z.record(z.string(), z.unknown()).nullable(),
  recurrence: calendarRecurrenceRuleSchema.nullable(),
  reminders: z.array(calendarReminderSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const createCalendarReminderInputSchema = z.object({
  minutesBeforeStart: z.number().int().min(0).max(43200),
  isEnabled: z.boolean().default(true),
});
export type CreateCalendarReminderInput = z.infer<
  typeof createCalendarReminderInputSchema
>;

export const createCalendarRecurrenceRuleInputSchema = z
  .object({
    rrule: z.string().min(1),
    seriesStartsAt: isoDateTimeSchema.optional(),
    untilAt: isoDateTimeSchema.nullable().optional(),
    count: z.number().int().positive().nullable().optional(),
    exdates: z.array(isoDateTimeSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.untilAt && value.count) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'untilAt and count cannot both be set on a recurrence rule',
        path: ['untilAt'],
      });
    }
  });
export type CreateCalendarRecurrenceRuleInput = z.infer<
  typeof createCalendarRecurrenceRuleInputSchema
>;

const baseCalendarEventInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().trim().max(4000).nullable().optional(),
  location: z.string().trim().max(255).nullable().optional(),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  timezone: timezoneSchema,
  isAllDay: z.boolean().default(false),
  source: calendarEventSourceSchema.default('manual'),
  status: calendarEventStatusSchema.default('confirmed'),
  externalReference: z.string().trim().max(255).nullable().optional(),
  rawPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  recurrence: createCalendarRecurrenceRuleInputSchema.nullable().optional(),
  reminders: z.array(createCalendarReminderInputSchema).default([]),
});

export const createCalendarEventInputSchema = baseCalendarEventInputSchema.superRefine((value, ctx) => {
    if (new Date(value.endAt).valueOf() <= new Date(value.startAt).valueOf()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endAt must be after startAt',
        path: ['endAt'],
      });
    }
  });
export type CreateCalendarEventInput = z.infer<
  typeof createCalendarEventInputSchema
>;

export const updateCalendarEventInputSchema = baseCalendarEventInputSchema
  .partial()
  .superRefine((value, ctx) => {
    if (!value.startAt || !value.endAt) {
      return;
    }

    if (new Date(value.endAt).valueOf() <= new Date(value.startAt).valueOf()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endAt must be after startAt',
        path: ['endAt'],
      });
    }
  });
export type UpdateCalendarEventInput = z.infer<
  typeof updateCalendarEventInputSchema
>;

export const calendarOccurrenceSchema = z.object({
  occurrenceId: z.string(),
  eventId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  timezone: timezoneSchema,
  status: calendarEventStatusSchema,
  source: calendarEventSourceSchema,
  isRecurring: z.boolean(),
});
export type CalendarOccurrence = z.infer<typeof calendarOccurrenceSchema>;

export const calendarEventsWindowResponseSchema = z.object({
  windowStart: isoDateTimeSchema,
  windowEnd: isoDateTimeSchema,
  timezone: timezoneSchema,
  events: z.array(calendarEventSchema),
  occurrences: z.array(calendarOccurrenceSchema),
});
export type CalendarEventsWindowResponse = z.infer<
  typeof calendarEventsWindowResponseSchema
>;

export const calendarReminderStatusSchema = z.enum(['due', 'upcoming']);
export type CalendarReminderStatus = z.infer<typeof calendarReminderStatusSchema>;

export const calendarReminderOccurrenceSchema = z.object({
  reminderId: z.string().uuid(),
  eventId: z.string().uuid(),
  occurrenceId: z.string(),
  title: z.string().min(1),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  remindAt: isoDateTimeSchema,
  minutesBeforeStart: z.number().int().min(0),
  timezone: timezoneSchema,
  status: calendarReminderStatusSchema,
});
export type CalendarReminderOccurrence = z.infer<
  typeof calendarReminderOccurrenceSchema
>;

export const calendarReminderWindowResponseSchema = z.object({
  windowStart: isoDateTimeSchema,
  windowEnd: isoDateTimeSchema,
  timezone: timezoneSchema,
  reminders: z.array(calendarReminderOccurrenceSchema),
});
export type CalendarReminderWindowResponse = z.infer<
  typeof calendarReminderWindowResponseSchema
>;

export const calendarSummaryDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurrences: z.array(calendarOccurrenceSchema),
});
export type CalendarSummaryDay = z.infer<typeof calendarSummaryDaySchema>;

export const calendarSummaryStatsSchema = z.object({
  totalOccurrences: z.number().int().nonnegative(),
  allDayOccurrences: z.number().int().nonnegative(),
  timedOccurrences: z.number().int().nonnegative(),
  recurringOccurrences: z.number().int().nonnegative(),
  oneTimeOccurrences: z.number().int().nonnegative(),
});
export type CalendarSummaryStats = z.infer<typeof calendarSummaryStatsSchema>;

export const calendarSummaryResponseSchema = z.object({
  windowStart: isoDateTimeSchema,
  windowEnd: isoDateTimeSchema,
  timezone: timezoneSchema,
  days: z.array(calendarSummaryDaySchema),
  stats: calendarSummaryStatsSchema,
});
export type CalendarSummaryResponse = z.infer<
  typeof calendarSummaryResponseSchema
>;
