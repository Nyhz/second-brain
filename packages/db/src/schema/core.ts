import {
  index,
  integer,
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

export const backupRuns = coreSchema.table(
  'backup_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    backupType: varchar('backup_type', { length: 64 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: jobRunStatus('status').notNull(),
    fileName: varchar('file_name', { length: 512 }),
    filePath: varchar('file_path', { length: 1024 }),
    fileSizeBytes: integer('file_size_bytes'),
    fileSha256: varchar('file_sha256', { length: 64 }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    errorMessage: varchar('error_message', { length: 1024 }),
    metricsJson: jsonb('metrics_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    fileDeletedAt: timestamp('file_deleted_at', { withTimezone: true }),
  },
  (table) => ({
    startedIdx: index('backup_runs_started_idx').on(table.startedAt),
    statusStartedIdx: index('backup_runs_status_started_idx').on(
      table.status,
      table.startedAt,
    ),
  }),
);

export const serviceHealthChecks = coreSchema.table(
  'service_health_checks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceName: varchar('service_name', { length: 64 }).notNull(),
    targetUrl: varchar('target_url', { length: 512 }).notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: varchar('status', { length: 16 }).notNull(),
    httpStatus: integer('http_status'),
    latencyMs: integer('latency_ms'),
    errorMessage: varchar('error_message', { length: 1024 }),
    source: varchar('source', { length: 16 }).notNull().default('scheduled'),
  },
  (table) => ({
    serviceCheckedIdx: index('service_health_checks_service_checked_idx').on(
      table.serviceName,
      table.checkedAt,
    ),
    checkedIdx: index('service_health_checks_checked_idx').on(table.checkedAt),
  }),
);
