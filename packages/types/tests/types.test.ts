import { describe, expect, test } from 'bun:test';
import {
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
});
