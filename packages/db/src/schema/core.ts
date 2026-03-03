import {
  jsonb,
  pgEnum,
  pgSchema,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const coreSchema = pgSchema('core');

export const jobRunStatus = pgEnum('job_run_status', [
  'success',
  'failed',
  'skipped',
]);

export const jobRuns = coreSchema.table('job_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobName: varchar('job_name', { length: 128 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: jobRunStatus('status').notNull(),
  errorMessage: varchar('error_message', { length: 1024 }),
  metricsJson: jsonb('metrics_json')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
});
