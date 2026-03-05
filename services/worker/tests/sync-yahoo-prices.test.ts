import { beforeEach, describe, expect, mock, test } from 'bun:test';

type SymbolRow = {
  symbol: string;
  firstBuyAt: Date | null;
  firstYahooPriceAt: Date | null;
};

const state = {
  symbolRows: [] as SymbolRow[],
  selectTexts: [] as string[],
  upserted: new Map<
    string,
    { symbol: string; source: string; pricedAtIso: string; price: number }
  >(),
};

const historicalCalls: Array<{
  symbol: string;
  period1: Date;
  period2: Date;
}> = [];

const attemptCountBySymbol = new Map<string, number>();

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    db: {
      execute: async (query?: { text?: string }) => {
        const text = query?.text ?? '';
        state.selectTexts.push(text);
        if (text.includes('with asset_symbols')) {
          return state.symbolRows;
        }
        return [];
      },
    },
    sql: Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = String.raw({ raw: strings }, ...values.map(String));
        if (text.includes('insert into finances.price_history')) {
          const symbol = String(values[0]);
          const pricedAtIso = String(values[1]);
          const price = Number(values[2]);
          const source = String(values[3]);
          const dateKey = new Date(pricedAtIso).toISOString().slice(0, 10);
          const key = `${symbol}|${source}|${dateKey}`;
          state.upserted.set(key, { symbol, source, pricedAtIso, price });
        }
        return [];
      },
      {
        end: async () => {},
      },
    ),
  });

  return {
    createDbClient,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: String.raw({ raw: strings }, ...values),
    }),
  };
});

mock.module('yahoo-finance2', () => {
  class MockYahooFinance {
    async historical(
      symbol: string,
      query: { period1: Date; period2: Date; interval: string },
    ) {
      historicalCalls.push({
        symbol,
        period1: query.period1,
        period2: query.period2,
      });
      const attempts = (attemptCountBySymbol.get(symbol) ?? 0) + 1;
      attemptCountBySymbol.set(symbol, attempts);

      if (symbol === 'AAPL' && attempts === 1) {
        throw new Error('transient failure');
      }

      if (query.interval !== '1d') {
        return [];
      }

      return [
        {
          date: new Date('2026-03-01T00:00:00.000Z'),
          close: symbol === 'EURUSD=X' ? 1.1 : 150,
        },
        {
          date: new Date('2026-03-02T00:00:00.000Z'),
          close: symbol === 'EURUSD=X' ? 1.09 : 152,
        },
      ];
    }
  }

  return {
    default: MockYahooFinance,
  };
});

const { syncYahooPrices } = await import('../src/jobs/sync-yahoo-prices');

beforeEach(() => {
  state.symbolRows = [];
  state.selectTexts = [];
  state.upserted = new Map();
  historicalCalls.length = 0;
  attemptCountBySymbol.clear();
});

describe('syncYahooPrices', () => {
  test('uses provider_symbol-first SQL and upserts FX rows', async () => {
    state.symbolRows = [
      {
        symbol: 'AAPL',
        firstBuyAt: new Date('2024-01-10T10:00:00.000Z'),
        firstYahooPriceAt: null,
      },
    ];

    const result = await syncYahooPrices('postgres://ignored', {
      requestDelayMs: 0,
      backfillDaysPerRun: 365,
      lookbackDays: 7,
    });

    expect(result.failures).toBe(0);
    expect(result.symbolsProcessed).toBe(1);
    expect(
      state.selectTexts.some((text) =>
        text.includes("nullif(trim(a.provider_symbol), '')"),
      ),
    ).toBe(true);
    expect(
      [...state.upserted.values()].some(
        (row) => row.symbol === 'EURUSD=X' && row.source === 'yahoo_fx',
      ),
    ).toBe(true);
  });

  test('is idempotent for daily upserts', async () => {
    state.symbolRows = [
      {
        symbol: 'MSFT',
        firstBuyAt: new Date('2025-02-10T10:00:00.000Z'),
        firstYahooPriceAt: null,
      },
    ];

    await syncYahooPrices('postgres://ignored', {
      requestDelayMs: 0,
      backfillDaysPerRun: 365,
      lookbackDays: 7,
    });
    const afterFirst = state.upserted.size;

    await syncYahooPrices('postgres://ignored', {
      requestDelayMs: 0,
      backfillDaysPerRun: 365,
      lookbackDays: 7,
    });
    const afterSecond = state.upserted.size;

    expect(afterFirst).toBe(afterSecond);
  });

  test('retries transient yahoo failures and triggers backfill call', async () => {
    state.symbolRows = [
      {
        symbol: 'AAPL',
        firstBuyAt: new Date('2019-01-10T10:00:00.000Z'),
        firstYahooPriceAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ];

    const result = await syncYahooPrices('postgres://ignored', {
      requestDelayMs: 0,
      backfillDaysPerRun: 365,
      lookbackDays: 7,
    });

    expect(result.failures).toBe(0);
    expect((attemptCountBySymbol.get('AAPL') ?? 0) >= 2).toBe(true);
    const aaplCalls = historicalCalls.filter((call) => call.symbol === 'AAPL');
    expect(aaplCalls.length).toBeGreaterThanOrEqual(2);
  });
});
