import { describe, expect, test } from 'bun:test';
import { loadApiEnv, loadAppEnv, loadWorkerEnv } from '../src/index';

describe('config', () => {
  test('parses api env', () => {
    const parsed = loadApiEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      API_PORT: '3001',
    });

    expect(parsed.API_PORT).toBe(3001);
  });

  test('parses app env with unified routing defaults', () => {
    const parsed = loadAppEnv({
      NEXT_PUBLIC_API_URL: '/api',
      INTERNAL_API_URL: 'http://api:3001',
      NEXT_PUBLIC_BASE_PATH: '/finances',
      FINANCES_PANEL_PORT: '3000',
      PORTAL_PORT: '3005',
    });

    expect(parsed.NEXT_PUBLIC_API_URL).toBe('/api');
    expect(parsed.NEXT_PUBLIC_BASE_PATH).toBe('/finances');
    expect(parsed.PORTAL_PORT).toBe(3005);
  });

  test('parses worker env with service probe defaults', () => {
    const parsed = loadWorkerEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      WORKER_PORT: '3002',
    });

    expect(parsed.SERVICE_HEALTH_INTERVAL_SECONDS).toBe(3600);
    expect(parsed.API_HEALTH_URL).toBe('http://api:3001/health');
    expect(parsed.CADDY_HEALTH_URL).toBe('http://caddy:8080/__caddy/healthz');
  });
});
