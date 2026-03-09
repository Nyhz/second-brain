import { loadApiEnv } from '@second-brain/config';
import { createDbClient } from '@second-brain/db';
import { Elysia } from 'elysia';
import { ApiHttpError } from './lib/errors';
import { log } from './lib/logger';
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
  registry,
} from './metrics';
import { registerCalendarRoutes } from './modules/calendar/routes';
import { registerFinancesRoutes } from './modules/finances/routes';
import { registerOpsRoutes } from './modules/ops/routes';

const UUID_PATH_SEGMENT_RE =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;
const NUMERIC_PATH_SEGMENT_RE = /\/\d+(?=\/|$)/g;

const sanitizeMetricsPath = (pathname: string) =>
  pathname
    .replace(UUID_PATH_SEGMENT_RE, '/:id')
    .replace(NUMERIC_PATH_SEGMENT_RE, '/:number');

export const createApiApp = () => {
  const env = loadApiEnv();
  const app = new Elysia();

  app.onRequest(({ request, store }) => {
    const mutableStore = store as Record<string, unknown>;
    mutableStore.startedAt = performance.now();
    mutableStore.method = request.method;
    mutableStore.path = sanitizeMetricsPath(new URL(request.url).pathname);
  });

  app.onAfterHandle(({ set, store }) => {
    const readStore = store as Record<string, unknown>;
    const method = (readStore.method as string) ?? 'UNKNOWN';
    const route = (readStore.path as string) ?? 'unknown';
    const statusCode = String(set.status ?? 200);
    const elapsedSeconds =
      (performance.now() - Number(readStore.startedAt ?? performance.now())) /
      1000;

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDurationSeconds.observe(
      { method, route, status_code: statusCode },
      elapsedSeconds,
    );
  });

  app.onError(({ code, error, set }) => {
    if (error instanceof ApiHttpError) {
      set.status = error.status;
      return error.body;
    }

    log('error', 'unhandled_error', { code, error: String(error) });
    set.status = 500;
    return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
  });

  app.get('/health', () => ({
    status: 'ok',
    service: 'api',
    ts: new Date().toISOString(),
  }));

  app.get('/ready', async ({ set }) => {
    try {
      const { sql } = createDbClient(env.DATABASE_URL);
      const [row] = await sql`select 1 as ok`;
      await sql.end();

      if (!row || row.ok !== 1) {
        throw new Error('database readiness check failed');
      }

      return { status: 'ready' };
    } catch (error) {
      set.status = 503;
      return {
        code: 'NOT_READY',
        message: 'Database unavailable',
        details: `${error}`,
      };
    }
  });

  app.get('/metrics', async ({ set }) => {
    set.headers['content-type'] = registry.contentType;
    return registry.metrics();
  });

  registerFinancesRoutes(app, env.DATABASE_URL);
  registerCalendarRoutes(app, env.DATABASE_URL, {
    defaultTimezone: env.PLATFORM_TIMEZONE,
  });
  registerOpsRoutes(app, env.DATABASE_URL, {
    timeoutMs: env.SERVICE_HEALTH_TIMEOUT_MS,
    targets: [
      { service: 'api', targetUrl: env.API_HEALTH_URL },
      { service: 'worker', targetUrl: env.WORKER_HEALTH_URL },
      { service: 'caddy', targetUrl: env.CADDY_HEALTH_URL },
    ],
  });

  return { app, env };
};
