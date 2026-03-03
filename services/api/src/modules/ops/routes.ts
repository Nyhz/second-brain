import { createDbClient, sql } from '@second-brain/db';
import type {
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

      const rows = await db.execute(sql`
      select
        service_name as "serviceName",
        checked_at as "checkedAt",
        status,
        http_status as "httpStatus",
        latency_ms as "latencyMs"
      from core.service_health_checks
      where checked_at >= now() - (${hours} || ' hours')::interval
      order by checked_at asc
    `);

      const services: ServiceName[] = ['api', 'worker', 'caddy'];
      const now = new Date();
      const start = new Date(now);
      start.setUTCMinutes(0, 0, 0);
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
};
