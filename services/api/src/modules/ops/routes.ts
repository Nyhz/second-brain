import { createDbClient, sql } from '@second-brain/db';
import type {
  BackupRun,
  JobRun,
  OpsDashboardResponse,
  OpsImportRunSummary,
  ServiceCheckNowResponse,
  ServiceName,
  ServiceStatus,
  ServiceStatusHistoryResponse,
} from '@second-brain/types';
import type { Elysia } from 'elysia';
import { ApiHttpError } from '../../lib/errors';

type ProbeTarget = {
  service: ServiceName;
  targetUrl: string;
};

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);

const toNullableIso = (value: unknown) => {
  if (value === null || value === undefined) return null;
  return toIso(value);
};

const toNullableString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  return String(value);
};

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  return Number(value);
};

const serializeJobRun = (row: Record<string, unknown>): JobRun => ({
  id: String(row.id),
  jobName: String(row.jobName),
  scheduledAt: toIso(row.scheduledAt),
  startedAt: toIso(row.startedAt),
  finishedAt: toNullableIso(row.finishedAt),
  status: String(row.status) as JobRun['status'],
  errorMessage: toNullableString(row.errorMessage),
  metricsJson:
    row.metricsJson && typeof row.metricsJson === 'object'
      ? (row.metricsJson as Record<string, unknown>)
      : {},
});

const serializeBackupRun = (row: Record<string, unknown>): BackupRun => ({
  id: String(row.id),
  backupType: String(row.backupType),
  startedAt: toIso(row.startedAt),
  finishedAt: toNullableIso(row.finishedAt),
  status: String(row.status) as BackupRun['status'],
  fileName: toNullableString(row.fileName),
  filePath: toNullableString(row.filePath),
  fileSizeBytes: toNullableNumber(row.fileSizeBytes),
  fileSha256: toNullableString(row.fileSha256),
  verifiedAt: toNullableIso(row.verifiedAt),
  errorMessage: toNullableString(row.errorMessage),
  metricsJson:
    row.metricsJson && typeof row.metricsJson === 'object'
      ? (row.metricsJson as Record<string, unknown>)
      : {},
  fileDeletedAt: toNullableIso(row.fileDeletedAt),
});

const serializeImportRun = (
  row: Record<string, unknown>,
): OpsImportRunSummary => {
  const dryRun = Boolean(row.dryRun);
  const failedRows = Number(row.failedRows ?? 0);
  return {
    id: String(row.id),
    source: String(row.source),
    accountId: String(row.accountId),
    filename: String(row.filename),
    dryRun,
    totalRows: Number(row.totalRows ?? 0),
    importedRows: Number(row.importedRows ?? 0),
    skippedRows: Number(row.skippedRows ?? 0),
    failedRows,
    createdAt: toIso(row.createdAt),
    reviewRecommended: dryRun || failedRows > 0,
  };
};

const bucketHourIso = (date: Date) => {
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    0,
    0,
    0,
  );
  return new Date(utc).toISOString();
};

const checkTarget = async (
  target: ProbeTarget,
  timeoutMs: number,
): Promise<{
  service: ServiceName;
  status: ServiceStatus;
  targetUrl: string;
  checkedAt: string;
  latencyMs: number | null;
  httpStatus: number | null;
  errorMessage: string | null;
}> => {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.targetUrl, {
      signal: controller.signal,
      cache: 'no-store',
    });
    return {
      service: target.service,
      status: response.ok ? 'operational' : 'degraded',
      targetUrl: target.targetUrl,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      httpStatus: response.status,
      errorMessage: null,
    };
  } catch (error) {
    return {
      service: target.service,
      status: 'down',
      targetUrl: target.targetUrl,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      httpStatus: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const registerOpsRoutes = (
  app: Elysia,
  databaseUrl: string,
  options?: {
    timeoutMs?: number;
    targets?: ProbeTarget[];
  },
) => {
  const { db } = createDbClient(databaseUrl);

  app.get(
    '/ops/status/history',
    async ({ query }): Promise<ServiceStatusHistoryResponse> => {
      const hoursRaw = Number(query.hours ?? 24);
      if (!Number.isFinite(hoursRaw)) {
        throw new ApiHttpError(
          400,
          'VALIDATION_ERROR',
          'hours must be a number',
        );
      }

      const hours = Math.max(1, Math.min(168, Math.floor(hoursRaw || 24)));
      const now = new Date();
      const nowHour = new Date(now);
      nowHour.setUTCMinutes(0, 0, 0);
      const queryWindowStart = new Date(nowHour);
      queryWindowStart.setUTCHours(queryWindowStart.getUTCHours() - hours);

      const queryWindowStartIso = queryWindowStart.toISOString();

      const rows = await db.execute(sql`
      select
        service_name as "serviceName",
        checked_at as "checkedAt",
        status,
        http_status as "httpStatus",
        latency_ms as "latencyMs"
      from core.service_health_checks
      where checked_at >= ${queryWindowStartIso}
      order by checked_at asc
    `);

      const services: ServiceName[] = ['api', 'worker', 'caddy'];
      const nowHourIso = bucketHourIso(nowHour);
      const hasCurrentHourData = rows.some(
        (row) => bucketHourIso(new Date(String(row.checkedAt))) === nowHourIso,
      );

      const end = new Date(nowHour);
      if (!hasCurrentHourData) {
        end.setUTCHours(end.getUTCHours() - 1);
      }

      const start = new Date(end);
      start.setUTCHours(start.getUTCHours() - (hours - 1));

      const hourSlots = Array.from({ length: hours }, (_, index) => {
        const date = new Date(start);
        date.setUTCHours(start.getUTCHours() + index);
        return bucketHourIso(date);
      });

      return {
        generatedAt: new Date().toISOString(),
        services: services.map((service) => {
          const byHour = new Map<
            string,
            {
              status: ServiceStatus;
              latencyMs: number | null;
              httpStatus: number | null;
              checkedAt: Date;
            }
          >();

          for (const row of rows) {
            if (String(row.serviceName) !== service) continue;
            const checkedAt = new Date(String(row.checkedAt));
            const hourIso = bucketHourIso(checkedAt);

            const existing = byHour.get(hourIso);
            if (!existing || checkedAt > existing.checkedAt) {
              byHour.set(hourIso, {
                status: String(row.status) as ServiceStatus,
                latencyMs:
                  row.latencyMs === null || row.latencyMs === undefined
                    ? null
                    : Number(row.latencyMs),
                httpStatus:
                  row.httpStatus === null || row.httpStatus === undefined
                    ? null
                    : Number(row.httpStatus),
                checkedAt,
              });
            }
          }

          return {
            service,
            points: hourSlots.map((hourIso) => {
              const hit = byHour.get(hourIso);
              return {
                hourIso,
                status: hit?.status ?? 'unknown',
                latencyMs: hit?.latencyMs ?? null,
                httpStatus: hit?.httpStatus ?? null,
              };
            }),
          };
        }),
      };
    },
  );

  app.post(
    '/ops/status/check-now',
    async (): Promise<ServiceCheckNowResponse> => {
      const timeoutMs = options?.timeoutMs ?? 5000;
      const targets: ProbeTarget[] = options?.targets ?? [
        { service: 'api', targetUrl: 'http://api:3001/health' },
        { service: 'worker', targetUrl: 'http://worker:3002/health' },
        { service: 'caddy', targetUrl: 'http://caddy:8080/__caddy/healthz' },
      ];

      const results = await Promise.all(
        targets.map((target) => checkTarget(target, timeoutMs)),
      );

      return {
        checkedAt: new Date().toISOString(),
        results,
      };
    },
  );

  app.get('/ops/dashboard', async ({ query }): Promise<OpsDashboardResponse> => {
    const limitRaw = Number(query.limit ?? 6);
    if (!Number.isFinite(limitRaw)) {
      throw new ApiHttpError(400, 'VALIDATION_ERROR', 'limit must be a number');
    }
    const limit = Math.max(1, Math.min(20, Math.floor(limitRaw || 6)));

    const [jobRows, backupRows, importRows] = await Promise.all([
      db.execute(sql`
        select
          id,
          job_name as "jobName",
          scheduled_at as "scheduledAt",
          started_at as "startedAt",
          finished_at as "finishedAt",
          status,
          error_message as "errorMessage",
          metrics_json as "metricsJson"
        from core.job_runs
        order by started_at desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          id,
          backup_type as "backupType",
          started_at as "startedAt",
          finished_at as "finishedAt",
          status,
          file_name as "fileName",
          file_path as "filePath",
          file_size_bytes as "fileSizeBytes",
          file_sha256 as "fileSha256",
          verified_at as "verifiedAt",
          error_message as "errorMessage",
          metrics_json as "metricsJson",
          file_deleted_at as "fileDeletedAt"
        from core.backup_runs
        order by started_at desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          id,
          source,
          account_id as "accountId",
          filename,
          dry_run as "dryRun",
          total_rows as "totalRows",
          imported_rows as "importedRows",
          skipped_rows as "skippedRows",
          failed_rows as "failedRows",
          created_at as "createdAt"
        from finances.transaction_imports
        order by created_at desc
        limit ${limit}
      `),
    ]);

    const jobs = jobRows.map((row) => serializeJobRun(row as Record<string, unknown>));
    const backups = backupRows.map((row) =>
      serializeBackupRun(row as Record<string, unknown>),
    );
    const imports = importRows.map((row) =>
      serializeImportRun(row as Record<string, unknown>),
    );

    const latestBackup = backups[0] ?? null;

    return {
      generatedAt: new Date().toISOString(),
      jobs,
      backups,
      imports,
      summary: {
        failedJobs: jobs.filter((job) => job.status === 'failed').length,
        failedImports: imports.filter((item) => item.failedRows > 0).length,
        reviewImports: imports.filter((item) => item.reviewRecommended).length,
        latestBackupAt: latestBackup?.startedAt ?? null,
        latestBackupStatus: latestBackup?.status ?? null,
        backupFresh: latestBackup
          ? Date.now() - new Date(latestBackup.startedAt).getTime() <=
            36 * 3600_000
          : false,
      },
    };
  });
};
