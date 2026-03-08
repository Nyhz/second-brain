import { describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ApiHttpError } from '../src/lib/errors';

const accountId = '70000000-0000-4000-8000-000000000001';

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    db: {
      execute: async (query?: { text?: string }) => {
        const text = query?.text ?? '';

        if (text.includes('from finances.accounts a')) {
          return [
            {
              id: accountId,
              name: 'Indexa EPSV',
              currency: 'EUR',
              baseCurrency: 'EUR',
              openingBalanceEur: 0,
              accountType: 'retirement_plan',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-03-01T00:00:00.000Z'),
              currentCashBalanceEur: 0,
            },
          ];
        }

        if (text.includes('with asset_rows as (') && text.includes('cash_rows as (')) {
          return [
            {
              id: 'tx-1',
              rowKind: 'asset_transaction',
              accountId,
              occurredAt: new Date('2026-02-12T12:00:00.000Z'),
              valueDate: null,
              transactionType: 'buy',
              movementType: null,
              assetId: 'asset-1',
              assetType: 'retirement_fund',
              assetLabel: 'INDEXA-EPSV - Indexa Capital',
              quantity: 235.45739,
              unitPrice: 21.23526,
              amountNative: -4999.998896,
              tradeGrossAmount: 4999.998896,
              currency: 'EUR',
              fxRateToEur: null,
              cashImpactEur: -5000,
              feesAmount: 0,
              feesCurrency: null,
              feesAmountEur: 0,
              netAmountEur: 5000,
              linkedTransactionId: null,
              notes: 'Monthly contribution',
              externalReference: null,
              source: 'manual',
            },
          ];
        }

        if (text.includes('from finances.daily_balances')) {
          return [{ balance: 12500.55 }];
        }

        if (text.includes('group by at.asset_id')) {
          return [
            {
              assetId: 'asset-1',
              assetName: 'Indexa Capital',
              assetType: 'retirement_fund',
              symbol: 'INDEXA-EPSV',
              quantity: 235.45739,
            },
          ];
        }

        return [];
      },
    },
  });

  const sqlCore = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: String.raw({ raw: strings }, ...values),
  });
  const sql = Object.assign(sqlCore, {
    join: (values: Array<{ text?: string }>, separator: { text?: string }) => ({
      text: values.map((value) => value.text ?? '').join(separator.text ?? ','),
    }),
  });
  const eq = () => ({});
  const and = (...conditions: unknown[]) => ({ type: 'and', conditions });
  const desc = (column: unknown) => ({ type: 'desc', column });
  const accounts = { __table: 'accounts' };
  const assets = { __table: 'assets' };
  const assetPositions = { __table: 'assetPositions' };
  const assetTransactions = { __table: 'assetTransactions' };
  const priceHistory = { __table: 'priceHistory' };
  const transactionImports = { __table: 'transactionImports' };
  const transactionImportRows = { __table: 'transactionImportRows' };
  const accountCashMovements = { __table: 'accountCashMovements' };
  const auditEvents = { __table: 'auditEvents' };

  return {
    createDbClient,
    sql,
    eq,
    and,
    desc,
    accounts,
    assets,
    assetPositions,
    assetTransactions,
    priceHistory,
    transactionImports,
    transactionImportRows,
    accountCashMovements,
    auditEvents,
  };
});

const { registerFinancesRoutes } = await import('../src/modules/finances/routes');

const buildApp = () => {
  const app = new Elysia();
  app.onError(({ error, set }) => {
    if (error instanceof ApiHttpError) {
      set.status = error.status;
      return error.body;
    }
    set.status = 500;
    return {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected server error',
    };
  });

  registerFinancesRoutes(app, 'postgres://test');
  return app;
};

describe('account pdf routes', () => {
  test('returns a transaction ledger pdf', async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request(
        `http://local/finances/accounts/${accountId}/transaction-ledger.pdf?periodMode=month&year=2026&month=2`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'indexa-epsv-2026-02-01-ledger.pdf',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF');
  });

  test('returns a statement pdf', async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request(
        `http://local/finances/accounts/${accountId}/statement.pdf?periodMode=ytd`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'indexa-epsv-ytd-statement.pdf',
    );
  });

  test('validates month exports require year and month', async () => {
    const app = buildApp();
    const response = await app.handle(
      new Request(
        `http://local/finances/accounts/${accountId}/transaction-ledger.pdf?periodMode=month&year=2026`,
      ),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
