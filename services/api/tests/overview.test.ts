import { describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';

const accountA = '10000000-0000-4000-8000-000000000001';
const accountB = '10000000-0000-4000-8000-000000000002';
const assetA = '20000000-0000-4000-8000-000000000001';
const assetB = '20000000-0000-4000-8000-000000000002';

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
            { assetId: assetA, assetName: 'Apple', symbol: 'AAPL', manualPrice: null },
            { assetId: assetB, assetName: 'Bitcoin', symbol: 'BTC', manualPrice: null },
          ];
        }

        if (text.includes('from finances.price_history')) {
          return [
            {
              symbol: 'AAPL',
              pricedAt: new Date('2026-03-02T00:00:00.000Z'),
              price: 110,
            },
            {
              symbol: 'BTC',
              pricedAt: new Date('2026-03-02T00:00:00.000Z'),
              price: 60,
            },
            {
              symbol: 'AAPL',
              pricedAt: new Date('2026-03-03T00:00:00.000Z'),
              price: 120,
            },
            {
              symbol: 'BTC',
              pricedAt: new Date('2026-03-03T00:00:00.000Z'),
              price: 65,
            },
          ];
        }

        return [];
      },
    },
  });

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: String.raw({ raw: strings }, ...values),
  });

  const eq = () => ({});
  const and = (...conditions: unknown[]) => ({ type: 'and', conditions });
  const desc = (column: unknown) => ({ type: 'desc', column });
  const accounts = { __table: 'accounts' };
  const assets = { __table: 'assets' };
  const assetPositions = { __table: 'assetPositions' };
  const assetTransactions = { __table: 'assetTransactions' };
  const priceHistory = { __table: 'priceHistory' };

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
  };
});

const { registerFinancesRoutes } = await import('../src/modules/finances/routes');

describe('finances overview route', () => {
  test('returns aggregated overview payload', async () => {
    const app = new Elysia();
    registerFinancesRoutes(app, 'postgres://ignored');

    const response = await app.handle(
      new Request('http://local/finances/overview?range=1M&accountId=all'),
    );

    expect(response.status).toBe(200);
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
    const app = new Elysia();
    registerFinancesRoutes(app, 'postgres://ignored');

    const response = await app.handle(
      new Request(`http://local/finances/overview?range=1M&accountId=${accountA}`),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      accountId: string;
      positions: Array<{ assetId: string }>;
    };

    expect(body.accountId).toBe(accountA);
    expect(body.positions.map((row) => row.assetId)).toEqual([assetA]);
  });

  test('rejects invalid range', async () => {
    const app = new Elysia();
    registerFinancesRoutes(app, 'postgres://ignored');

    const response = await app.handle(
      new Request('http://local/finances/overview?range=bad&accountId=all'),
    );

    expect(response.status).toBe(400);
  });
});
