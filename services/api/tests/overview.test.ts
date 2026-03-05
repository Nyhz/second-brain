import { describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ApiHttpError } from '../src/lib/errors';

const accountA = '10000000-0000-4000-8000-000000000001';
const accountB = '10000000-0000-4000-8000-000000000002';
const assetA = '20000000-0000-4000-8000-000000000001';
const assetB = '20000000-0000-4000-8000-000000000002';

const priceRows = [
  {
    symbol: 'AAPL',
    pricedAt: new Date('2020-03-01T00:00:00.000Z'),
    price: 75,
    source: 'yahoo',
  },
  {
    symbol: 'BTC',
    pricedAt: new Date('2020-03-01T00:00:00.000Z'),
    price: 10,
    source: 'yahoo',
  },
  {
    symbol: 'AAPL',
    pricedAt: new Date('2026-03-02T00:00:00.000Z'),
    price: 110,
    source: 'yahoo',
  },
  {
    symbol: 'BTC',
    pricedAt: new Date('2026-03-02T00:00:00.000Z'),
    price: 60,
    source: 'yahoo',
  },
  {
    symbol: 'AAPL',
    pricedAt: new Date('2026-03-03T00:00:00.000Z'),
    price: 120,
    source: 'yahoo',
  },
  {
    symbol: 'BTC',
    pricedAt: new Date('2026-03-03T00:00:00.000Z'),
    price: 65,
    source: 'yahoo',
  },
  {
    symbol: 'EURUSD=X',
    pricedAt: new Date('2026-03-02T00:00:00.000Z'),
    price: 1.2,
    source: 'yahoo_fx',
  },
  {
    symbol: 'EURUSD=X',
    pricedAt: new Date('2026-03-03T00:00:00.000Z'),
    price: 1.1,
    source: 'yahoo_fx',
  },
];

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    db: {
      execute: async (query?: { text?: string }) => {
        const text = query?.text ?? '';

        if (text.includes('from finances.accounts')) {
          return [
            { id: accountA, name: 'Broker A', openingBalanceEur: 1000 },
            { id: accountB, name: 'Broker B', openingBalanceEur: 500 },
          ];
        }

        if (text.includes('from finances.asset_transactions')) {
          const rows = [
            {
              accountId: accountA,
              assetId: assetA,
              transactionType: 'buy',
              tradedAt: new Date('2026-03-01T10:00:00.000Z'),
              quantity: 2,
              unitPrice: 100,
              tradeCurrency: 'USD',
              fxRateToEur: 0.9,
              cashImpactEur: -200,
              assetName: 'Apple',
              symbol: 'AAPL',
            },
            {
              accountId: accountB,
              assetId: assetB,
              transactionType: 'buy',
              tradedAt: new Date('2026-03-01T10:00:00.000Z'),
              quantity: 1,
              unitPrice: 50,
              tradeCurrency: 'EUR',
              fxRateToEur: null,
              cashImpactEur: -50,
              assetName: 'Bitcoin',
              symbol: 'BTC',
            },
          ];
          if (text.includes('where at.account_id')) {
            return rows.filter((row) => row.accountId === accountA);
          }
          return rows;
        }

        if (text.includes('from finances.assets a')) {
          return [
            {
              assetId: assetA,
              assetName: 'Apple',
              symbol: 'AAPL',
              currency: 'USD',
              manualPrice: null,
            },
            {
              assetId: assetB,
              assetName: 'Bitcoin',
              symbol: 'BTC',
              currency: 'EUR',
              manualPrice: null,
            },
          ];
        }

        if (text.includes('min(priced_at) as "minPricedAt"')) {
          const sorted = [...priceRows].sort(
            (a, b) => a.pricedAt.valueOf() - b.pricedAt.valueOf(),
          );
          return [
            {
              minPricedAt: sorted[0]?.pricedAt ?? null,
              maxPricedAt: sorted[sorted.length - 1]?.pricedAt ?? null,
            },
          ];
        }

        if (text.includes('select distinct priced_at as "pricedAt"')) {
          const unique = [
            ...new Set(
              priceRows
                .map((row) => row.pricedAt.toISOString())
                .sort((a, b) => b.localeCompare(a)),
            ),
          ].slice(0, 2);
          return unique.map((iso) => ({ pricedAt: new Date(iso) }));
        }

        if (text.includes('from finances.price_history')) {
          return priceRows;
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
  };
});

const { registerFinancesRoutes } = await import(
  '../src/modules/finances/routes'
);

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
      message:
        error instanceof Error ? error.message : 'Unexpected server error',
    };
  });
  registerFinancesRoutes(app, 'postgres://ignored');
  return app;
};

const expectStatus = async (response: Response, status: number) => {
  if (response.status !== status) {
    const body = await response.text();
    throw new Error(
      `Expected status ${status}, received ${response.status}: ${body}`,
    );
  }
};

describe('finances overview route', () => {
  test('returns aggregated overview payload', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request('http://local/finances/overview?range=1M&accountId=all'),
    );

    await expectStatus(response, 200);
    const body = (await response.json()) as {
      range: string;
      accounts: Array<{ id: string; name: string }>;
      series: Array<{ tsIso: string; value: number }>;
      positions: Array<{ assetId: string; symbol: string }>;
    };

    expect(body.range).toBe('1M');
    expect(body.accounts.length).toBe(2);
    expect(body.series.length).toBeGreaterThan(0);
    expect(body.positions.length).toBe(2);
  });

  test('filters by accountId', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request(
        `http://local/finances/overview?range=1M&accountId=${accountA}`,
      ),
    );

    await expectStatus(response, 200);
    const body = (await response.json()) as {
      accountId: string;
      positions: Array<{ assetId: string }>;
    };

    expect(body.accountId).toBe(accountA);
    expect(body.positions.map((row) => row.assetId)).toEqual([assetA]);
  });

  test('converts USD positions to EUR using market FX history', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request(
        `http://local/finances/overview?range=1M&accountId=${accountA}`,
      ),
    );

    await expectStatus(response, 200);
    const body = (await response.json()) as {
      totalValue: number;
      positions: Array<{ currentUnitEur: number; symbol: string }>;
    };

    const aapl = body.positions.find((row) => row.symbol === 'AAPL');
    expect(aapl).toBeDefined();
    expect(aapl?.currentUnitEur).toBeCloseTo(109.09, 2);
    expect(body.totalValue).toBeCloseTo(1018.18, 2);
  });

  test('rejects invalid range', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request('http://local/finances/overview?range=bad&accountId=all'),
    );

    await expectStatus(response, 400);
  });

  test('uses first transaction as MAX range start', async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request('http://local/finances/overview?range=MAX&accountId=all'),
    );

    await expectStatus(response, 200);
    const body = (await response.json()) as {
      rangeStartIso: string;
      series: Array<{ tsIso: string }>;
    };

    expect(body.rangeStartIso).toBe('2026-03-01T10:00:00.000Z');
    expect(body.series[0]?.tsIso >= '2026-03-01T10:00:00.000Z').toBe(true);
  });
});
