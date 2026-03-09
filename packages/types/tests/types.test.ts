import { describe, expect, test } from 'bun:test';
import {
  createCalendarEventInputSchema,
  createAccountInputSchema,
  createAssetInputSchema,
} from '../src/index';

describe('types schemas', () => {
  test('validates account payload', () => {
    const result = createAccountInputSchema.safeParse({
      name: 'Main Account',
      currency: 'USD',
      accountType: 'checking',
    });
    const retirementPlanResult = createAccountInputSchema.safeParse({
      name: 'My Retirement Plan',
      currency: 'EUR',
      accountType: 'retirement_plan',
    });

    expect(result.success).toBe(true);
    expect(retirementPlanResult.success).toBe(true);
  });

  test('allows short retirement fund identifier and keeps strict ISIN for stock', () => {
    const retirementResult = createAssetInputSchema.safeParse({
      name: 'My Pension Fund',
      assetType: 'retirement_fund',
      ticker: 'N5138',
      isin: 'N5138',
      currency: 'EUR',
      quantity: 1,
    });
    const stockResult = createAssetInputSchema.safeParse({
      name: 'Invalid Stock',
      assetType: 'stock',
      symbol: 'IVS',
      ticker: 'IVS',
      isin: 'N5138',
      currency: 'EUR',
      quantity: 1,
    });

    expect(retirementResult.success).toBe(true);
    expect(stockResult.success).toBe(false);
  });

  test('validates calendar event payloads with recurrence and reminders', () => {
    const valid = createCalendarEventInputSchema.safeParse({
      title: 'Dentist',
      startAt: '2026-03-09T16:00:00.000Z',
      endAt: '2026-03-09T17:00:00.000Z',
      timezone: 'Europe/Madrid',
      source: 'ai',
      reminders: [{ minutesBeforeStart: 30 }],
      recurrence: {
        rrule: 'FREQ=WEEKLY;INTERVAL=1',
        seriesStartsAt: '2026-03-09T16:00:00.000Z',
      },
    });
    const invalid = createCalendarEventInputSchema.safeParse({
      title: 'Broken event',
      startAt: '2026-03-09T17:00:00.000Z',
      endAt: '2026-03-09T16:00:00.000Z',
      timezone: 'Europe/Madrid',
      reminders: [],
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
