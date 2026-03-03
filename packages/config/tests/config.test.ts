import { describe, expect, test } from 'bun:test';
import { loadApiEnv } from '../src/index';

describe('config', () => {
  test('parses api env', () => {
    const parsed = loadApiEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      API_PORT: '3001',
    });

    expect(parsed.API_PORT).toBe(3001);
  });
});
