import type { Account } from '@second-brain/types';
import { describe, expect, test } from 'bun:test';
import {
  getAccountSlugById,
  resolveAccountIdFromPathSegment,
} from '../lib/account-slugs';

const makeAccount = (overrides: Partial<Account>): Account => ({
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Main Broker',
  currency: 'EUR',
  baseCurrency: 'EUR',
  openingBalanceEur: 0,
  currentCashBalanceEur: 0,
  accountType: 'brokerage',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...overrides,
});

describe('account route slugs', () => {
  test('builds clean slugs from account names', () => {
    const account = makeAccount({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Bróker Ñame  2026',
    });

    expect(getAccountSlugById(account.id, [account])).toBe('broker-name-2026');
  });

  test('disambiguates duplicate account names deterministically', () => {
    const first = makeAccount({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Main Account',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const second = makeAccount({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Main Account',
      createdAt: '2026-02-01T00:00:00.000Z',
    });

    expect(getAccountSlugById(first.id, [second, first])).toBe('main-account');
    expect(getAccountSlugById(second.id, [second, first])).toBe('main-account-2');
  });

  test('resolves either a slug or uuid path segment to account id', () => {
    const account = makeAccount({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Retirement Fund',
    });

    expect(resolveAccountIdFromPathSegment('retirement-fund', [account])).toBe(
      account.id,
    );
    expect(resolveAccountIdFromPathSegment(account.id, [account])).toBe(
      account.id,
    );
  });
});
