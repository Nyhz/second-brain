import { describe, expect, test } from 'bun:test';
import type { Account } from '@second-brain/types';
import { validateAccountForm } from '../lib/accounts';
import { ApiRequestError } from '../lib/api';
import { getApiErrorMessage } from '../lib/errors';
import { formatMoney, formatMoneyByCurrency } from '../lib/format';
import { toInputDate, validateTransactionForm } from '../lib/transactions';
import {
  canCreateTransactionsForAccount,
  getAllowedImportSourcesForAccount,
  getTransactionFeeLabel,
} from '../components/features/transactions/transactions-shared';

const formatTimelineAmount = (amount: number | null, currency: string): string => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '-';
  }
  const normalizedCurrency = currency.trim().toUpperCase();
  const decimals = normalizedCurrency === 'EUR' || normalizedCurrency === 'USD' ? 2 : 4;
  return formatMoneyByCurrency(amount, normalizedCurrency, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const makeAccount = (overrides: Partial<Account>): Account => ({
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Main Account',
  currency: 'EUR',
  baseCurrency: 'EUR',
  openingBalanceEur: 0,
  currentCashBalanceEur: 0,
  accountType: 'brokerage',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...overrides,
});

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

  test('formats transaction fee labels for the timeline', () => {
    expect(
      getTransactionFeeLabel({
        id: '1',
        rowKind: 'asset_transaction',
        accountId: '2',
        occurredAt: '2026-03-03T12:00:00.000Z',
        valueDate: null,
        transactionType: 'buy',
        movementType: null,
        assetId: '3',
        assetType: 'stock',
        assetLabel: 'ACME · Acme Corp',
        quantity: 1,
        unitPrice: 10,
        amountNative: -10,
        tradeGrossAmount: 10,
        currency: 'EUR',
        fxRateToEur: null,
        cashImpactEur: -10.5,
        feesAmount: 0.5,
        feesCurrency: 'EUR',
        feesAmountEur: 0.5,
        netAmountEur: 10.5,
        linkedTransactionId: null,
        notes: null,
        externalReference: null,
        source: 'degiro',
      }),
    ).toBe(formatMoney(0.5));

    expect(
      getTransactionFeeLabel({
        id: '4',
        rowKind: 'cash_movement',
        accountId: '2',
        occurredAt: '2026-03-03T12:00:00.000Z',
        valueDate: null,
        transactionType: null,
        movementType: 'deposit',
        assetId: null,
        assetType: null,
        assetLabel: null,
        quantity: null,
        unitPrice: null,
        amountNative: 100,
        tradeGrossAmount: null,
        currency: 'EUR',
        fxRateToEur: null,
        cashImpactEur: 100,
        feesAmount: null,
        feesCurrency: null,
        feesAmountEur: null,
        netAmountEur: null,
        linkedTransactionId: null,
        notes: null,
        externalReference: null,
        source: null,
      }),
    ).toBe('-');
  });

  test('formats timeline amount precision by currency', () => {
    expect(formatTimelineAmount(-4999.998896, 'EUR')).toBe('-€5,000.00');
    expect(formatTimelineAmount(12.3456, 'USD')).toBe('$12.35');
    expect(formatTimelineAmount(0.123456, 'BTC')).toBe('BTC 0.1235');
  });

  test('maps account capabilities for account-scoped transaction actions', () => {
    expect(
      canCreateTransactionsForAccount(
        makeAccount({ accountType: 'investment_platform' }),
      ),
    ).toBe(true);
    expect(
      canCreateTransactionsForAccount(makeAccount({ accountType: 'savings' })),
    ).toBe(true);
    expect(
      canCreateTransactionsForAccount(makeAccount({ accountType: 'checking' })),
    ).toBe(false);

    expect(
      getAllowedImportSourcesForAccount(
        makeAccount({ accountType: 'brokerage' }),
      ),
    ).toEqual(['degiro']);
    expect(
      getAllowedImportSourcesForAccount(
        makeAccount({ accountType: 'crypto_exchange' }),
      ),
    ).toEqual(['binance']);
    expect(
      getAllowedImportSourcesForAccount(
        makeAccount({ accountType: 'investment_platform' }),
      ),
    ).toEqual(['cobas']);
    expect(
      getAllowedImportSourcesForAccount(
        makeAccount({ accountType: 'retirement_plan' }),
      ),
    ).toEqual([]);
  });
});
