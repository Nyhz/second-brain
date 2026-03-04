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
        assetType: 'stock',
        assetId: 'asset',
        transactionType: 'buy',
        tradedAt: '2026-03-03T12:00',
        quantity: '1',
        unitPrice: '10',
        tradeCurrency: 'EUR',
        fxRateToEur: '',
        feesAmount: '0',
        feesCurrency: 'EUR',
        notes: '',
      }),
    ).toEqual({
      ok: false,
      message: 'Select an account before creating a transaction.',
    });

    expect(
      validateTransactionForm({
        accountId: '1',
        assetType: 'stock',
        assetId: '',
        transactionType: 'buy',
        tradedAt: '2026-03-03T12:00',
        quantity: '0',
        unitPrice: '0',
        tradeCurrency: 'EUR',
        fxRateToEur: '',
        feesAmount: '0',
        feesCurrency: 'EUR',
        notes: '',
      }),
    ).toEqual({
      ok: false,
      message: 'Select an asset type and an asset.',
    });

    expect(
      validateTransactionForm({
        accountId: '1',
        assetType: 'stock',
        assetId: '2',
        transactionType: 'dividend',
        tradedAt: '2026-03-03T12:00',
        quantity: '0',
        unitPrice: '0',
        tradeCurrency: 'EUR',
        fxRateToEur: '',
        feesAmount: '0',
        feesCurrency: 'EUR',
        notes: '',
      }),
    ).toEqual({
      ok: false,
      message: 'Dividend transactions are not supported in this app.',
    });

    expect(
      validateTransactionForm({
        accountId: '1',
        assetType: 'stock',
        assetId: '2',
        transactionType: 'buy',
        tradedAt: '2026-03-03T12:00',
        quantity: '2',
        unitPrice: '12.35',
        tradeCurrency: 'EUR',
        fxRateToEur: '',
        feesAmount: '0.5',
        feesCurrency: 'EUR',
        notes: ' note ',
      }),
    ).toEqual({
      ok: true,
      normalized: {
        accountId: '1',
        assetType: 'stock',
        assetId: '2',
        transactionType: 'buy',
        tradedAt: '2026-03-03T12:00',
        quantity: 2,
        unitPrice: 12.35,
        tradeCurrency: 'EUR',
        fxRateToEur: null,
        feesAmount: 0.5,
        feesCurrency: 'EUR',
        notes: 'note',
      },
    });
  });

  test('formats amounts and dates for display', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(toInputDate('2026-03-01T12:30:00.000Z')).toMatch(
      /^2026-03-01T12:30/,
    );
    expect(toInputDate('invalid-date')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
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
