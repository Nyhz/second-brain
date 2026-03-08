import { describe, expect, test } from 'bun:test';
import { buildAccountPdfUrl } from '../lib/account-pdf';

describe('account pdf export urls', () => {
  test('builds month-based ledger urls', () => {
    expect(
      buildAccountPdfUrl({
        accountId: '11111111-1111-1111-1111-111111111111',
        documentType: 'transaction-ledger',
        periodMode: 'month',
        year: 2026,
        month: 2,
      }),
    ).toBe(
      '/api/finances/accounts/11111111-1111-1111-1111-111111111111/transaction-ledger.pdf?periodMode=month&year=2026&month=2',
    );
  });

  test('builds ytd statement urls', () => {
    expect(
      buildAccountPdfUrl({
        accountId: '11111111-1111-1111-1111-111111111111',
        documentType: 'statement',
        periodMode: 'ytd',
      }),
    ).toBe(
      '/api/finances/accounts/11111111-1111-1111-1111-111111111111/statement.pdf?periodMode=ytd',
    );
  });
});
