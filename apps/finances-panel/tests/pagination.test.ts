import { describe, expect, test } from 'bun:test';
import { clampPage, resolvePageSize } from '../lib/pagination';

describe('pagination helpers', () => {
  test('accepts only allowed page sizes', () => {
    expect(resolvePageSize('10', [10, 25, 50], 25)).toBe(10);
    expect(resolvePageSize('12', [10, 25, 50], 25)).toBe(25);
    expect(resolvePageSize(undefined, [10, 25, 50], 25)).toBe(25);
  });

  test('clamps page within valid bounds', () => {
    expect(clampPage('3', 8)).toBe(3);
    expect(clampPage('0', 8)).toBe(1);
    expect(clampPage('99', 8)).toBe(8);
    expect(clampPage(undefined, 8)).toBe(1);
  });
});
