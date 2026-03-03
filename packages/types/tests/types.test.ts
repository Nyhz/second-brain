import { describe, expect, test } from 'bun:test';
import { createAccountInputSchema } from '../src/index';

describe('types schemas', () => {
  test('validates account payload', () => {
    const result = createAccountInputSchema.safeParse({
      name: 'Main Account',
      currency: 'USD',
      accountType: 'checking',
    });

    expect(result.success).toBe(true);
  });
});
