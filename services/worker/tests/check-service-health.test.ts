import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const inserts: Array<{
  service: string;
  status: string;
  httpStatus: number | null;
}> = [];
const statements: string[] = [];

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    sql: Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = String.raw({ raw: strings }, ...values.map(String));
        statements.push(text);
        if (text.includes('insert into core.service_health_checks')) {
          inserts.push({
            service: String(values[0]),
            status: String(values[3]),
            httpStatus:
              values[4] === null || values[4] === undefined
                ? null
                : Number(values[4]),
          });
        }
        return [];
      },
      {
        end: async () => {},
      },
    ),
  });

  return { createDbClient };
});

const { checkServiceHealth } = await import('../src/jobs/check-service-health');

const originalFetch = globalThis.fetch;

beforeEach(() => {
  inserts.length = 0;
  statements.length = 0;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('checkServiceHealth', () => {
  test('stores operational, degraded and down checks', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api')) {
        return new Response('ok', { status: 200 });
      }
      if (url.includes('worker')) {
        return new Response('bad gateway', { status: 502 });
      }
      throw new Error('connection refused');
    }) as typeof fetch;

    const metrics = await checkServiceHealth(
      'postgres://ignored',
      [
        { service: 'api', targetUrl: 'http://api:3001/health' },
        { service: 'worker', targetUrl: 'http://worker:3002/health' },
        { service: 'caddy', targetUrl: 'http://caddy:80/__caddy/healthz' },
      ],
      1000,
    );

    expect(metrics.targets).toBe(3);
    expect(metrics.operational).toBe(1);
    expect(metrics.degraded).toBe(1);
    expect(metrics.down).toBe(1);

    expect(inserts.length).toBe(3);
    expect(inserts.find((row) => row.service === 'api')?.status).toBe(
      'operational',
    );
    expect(inserts.find((row) => row.service === 'worker')?.status).toBe(
      'degraded',
    );
    expect(inserts.find((row) => row.service === 'caddy')?.status).toBe('down');
    expect(
      statements.some((item) =>
        item.includes('delete from core.service_health_checks'),
      ),
    ).toBe(true);
  });
});
