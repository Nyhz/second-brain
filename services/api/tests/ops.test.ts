import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';

const checks = [
  {
    serviceName: 'api',
    checkedAt: new Date('2026-03-03T10:00:00.000Z'),
    status: 'operational',
    httpStatus: 200,
    latencyMs: 30,
  },
  {
    serviceName: 'worker',
    checkedAt: new Date('2026-03-03T10:00:00.000Z'),
    status: 'degraded',
    httpStatus: 503,
    latencyMs: 120,
  },
];

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    db: {
      execute: async (query?: { text?: string }) => {
        const text = query?.text ?? '';
        if (text.includes('from core.service_health_checks')) {
          return checks;
        }
        return [];
      },
    },
  });

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: String.raw({ raw: strings }, ...values),
  });

  const eq = (column: unknown, value: unknown) => ({ column, value });
  const and = (...conditions: unknown[]) => ({ type: 'and', conditions });
  const desc = (column: unknown) => ({ type: 'desc', column });
  const accounts = { __table: 'accounts' };
  const assets = { __table: 'assets' };
  const assetPositions = { __table: 'assetPositions' };
  const assetTransactions = { __table: 'assetTransactions' };
  const priceHistory = { __table: 'priceHistory' };

  return {
    createDbClient,
    sql,
    eq,
    and,
    desc,
    accounts,
    assets,
    assetPositions,
    assetTransactions,
    priceHistory,
  };
});

const { registerOpsRoutes } = await import('../src/modules/ops/routes');

const parseResponse = async <T>(response: Response): Promise<T> =>
  (await response.json()) as T;

const createRequest = (path: string, init?: RequestInit) =>
  new Request(`http://local${path}`, init);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('worker')) {
      return new Response('down', { status: 503 });
    }
    return new Response('ok', { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('ops routes', () => {
  test('returns 24h history buckets', async () => {
    const app = new Elysia();
    registerOpsRoutes(app, 'postgres://ignored');

    const response = await app.handle(
      createRequest('/ops/status/history?hours=24'),
    );
    expect(response.status).toBe(200);

    const body = await parseResponse<{
      services: Array<{ service: string; points: Array<{ status: string }> }>;
    }>(response);

    expect(body.services.length).toBe(3);
    expect(body.services[0]?.points.length).toBe(24);
  });

  test('returns check-now snapshot without persistence', async () => {
    const app = new Elysia();
    registerOpsRoutes(app, 'postgres://ignored');

    const response = await app.handle(
      createRequest('/ops/status/check-now', { method: 'POST' }),
    );
    expect(response.status).toBe(200);

    const body = await parseResponse<{
      results: Array<{ service: string; status: string }>;
    }>(response);

    expect(body.results.length).toBe(3);
    expect(
      body.results.find((result) => result.service === 'api')?.status,
    ).toBe('operational');
    expect(
      body.results.find((result) => result.service === 'worker')?.status,
    ).toBe('degraded');
  });

  test('uses latest populated hour as rightmost timeline slot', async () => {
    const nowHour = new Date();
    nowHour.setUTCMinutes(0, 0, 0);
    const previousHour = new Date(nowHour);
    previousHour.setUTCHours(previousHour.getUTCHours() - 1);

    checks.length = 0;
    checks.push(
      {
        serviceName: 'api',
        checkedAt: previousHour,
        status: 'operational',
        httpStatus: 200,
        latencyMs: 25,
      },
      {
        serviceName: 'worker',
        checkedAt: previousHour,
        status: 'operational',
        httpStatus: 200,
        latencyMs: 30,
      },
      {
        serviceName: 'caddy',
        checkedAt: previousHour,
        status: 'operational',
        httpStatus: 200,
        latencyMs: 20,
      },
    );

    const app = new Elysia();
    registerOpsRoutes(app, 'postgres://ignored');

    const response = await app.handle(
      createRequest('/ops/status/history?hours=24'),
    );
    expect(response.status).toBe(200);

    const body = await parseResponse<{
      services: Array<{
        service: string;
        points: Array<{ hourIso: string; status: string }>;
      }>;
    }>(response);

    const apiPoints = body.services.find(
      (service) => service.service === 'api',
    )?.points;
    expect(apiPoints).toBeDefined();
    const last = apiPoints?.at(-1);
    expect(last?.hourIso).toBe(previousHour.toISOString());
    expect(last?.status).toBe('operational');
  });
});
