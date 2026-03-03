import { describe, expect, test } from 'bun:test';
import { validateAccountForm } from '../lib/accounts';
import { ApiRequestError } from '../lib/api';
import { getApiErrorMessage } from '../lib/errors';
import { formatMoney } from '../lib/format';
import { toInputDate, validateTransactionForm } from '../lib/transactions';

describe('finances panel workflow helpers', () => {
  test('validates account creation payload', () => {
    expect(validateAccountForm('', 'usd')).toEqual({
      ok: false,
      message: 'Account name is required.',
    });

    expect(validateAccountForm('Main', 'US')).toEqual({
      ok: false,
      message: 'Currency must be a 3-letter code (for example, USD).',
    });

    expect(validateAccountForm(' Main ', 'usd')).toEqual({
      ok: true,
      normalized: {
        name: 'Main',
        currency: 'USD',
      },
    });
  });

  test('validates transaction creation/edit payload', () => {
    expect(
      validateTransactionForm({
        accountId: '',
        postedAt: '2026-03-03',
        amount: '10',
        description: 'Coffee',
        category: 'food',
      }),
    ).toEqual({
      ok: false,
      message: 'Select an account before creating a transaction.',
    });

    expect(
      validateTransactionForm({
        accountId: '1',
        postedAt: '2026-03-03',
        amount: '0',
        description: 'Coffee',
        category: 'food',
      }),
    ).toEqual({
      ok: false,
      message: 'Amount must be a non-zero number.',
    });

    expect(
      validateTransactionForm({
        accountId: '1',
        postedAt: '2026-03-03',
        amount: '-12.35',
        description: ' Lunch ',
        category: ' food ',
      }),
    ).toEqual({
      ok: true,
      normalized: {
        accountId: '1',
        postedAt: '2026-03-03',
        amount: -12.35,
        description: 'Lunch',
        category: 'food',
      },
    });
  });

  test('formats amounts and dates for display', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(toInputDate('2026-03-01T12:30:00.000Z')).toBe('2026-03-01');
    expect(toInputDate('invalid-date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('maps API errors to UI messages', () => {
    const apiError = new ApiRequestError(404, {
      code: 'ACCOUNT_NOT_FOUND',
      message: 'Account does not exist',
    });
    expect(getApiErrorMessage(apiError)).toBe('Account does not exist');
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
    expect(getApiErrorMessage('bad')).toBe('Unexpected error');
  });
});
