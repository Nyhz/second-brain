import { describe, expect, test } from 'bun:test';

describe('ui package smoke', () => {
  test('exports package entry points', async () => {
    const mod = await import('../src/index');
    expect(mod.Card).toBeDefined();
    expect(mod.KpiCard).toBeDefined();
  });
});
