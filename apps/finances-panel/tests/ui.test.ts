import { describe, expect, test } from 'bun:test';
import { validateAccountForm } from '../lib/accounts';
import { ApiRequestError } from '../lib/api';
import { getApiErrorMessage } from '../lib/errors';
import { formatMoney } from '../lib/format';
import { toInputDate, validateTransactionForm } from '../lib/transactions';

describe('finances panel workflow helpers', () => {
  test('validates account creation payload', () => {
    expect(validateAccountForm('')).toEqual({
      ok: false,
      message: 'Account name is required.',
    });

    expect(validateAccountForm(' Main ')).toEqual({
      ok: true,
      normalized: {
        name: 'Main',
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
        dividendGross: '',
        dividendNet: '',
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
        dividendGross: '',
        dividendNet: '',
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
        dividendGross: '10',
        dividendNet: '8.5',
        notes: '',
      }),
    ).toEqual({
      ok: true,
      normalized: {
        accountId: '1',
        assetType: 'stock',
        assetId: '2',
        transactionType: 'dividend',
        tradedAt: '2026-03-03T12:00',
        quantity: 0,
        unitPrice: 0,
        tradeCurrency: 'EUR',
        fxRateToEur: null,
        feesAmount: 0,
        feesCurrency: 'EUR',
        dividendGross: 10,
        withholdingTax: 1.5,
        dividendNet: 8.5,
        notes: null,
      },
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
        dividendGross: '',
        dividendNet: '',
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
        dividendGross: null,
        withholdingTax: null,
        dividendNet: null,
        notes: 'note',
      },
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
        tradeCurrency: 'GBP',
        fxRateToEur: '1.17',
        feesAmount: '0.5',
        feesCurrency: 'GBP',
        dividendGross: '',
        dividendNet: '',
        notes: '',
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
        tradeCurrency: 'GBP',
        fxRateToEur: 1.17,
        feesAmount: 0.5,
        feesCurrency: 'GBP',
        dividendGross: null,
        withholdingTax: null,
        dividendNet: null,
        notes: null,
      },
    });
  });

  test('formats amounts and dates for display', () => {
    expect(formatMoney(1234.5)).toBe('€1,234.50');
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
