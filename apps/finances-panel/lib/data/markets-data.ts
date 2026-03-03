import { getDailyPriceMeta, getMarkets } from '../mock/markets';
import { buildSparkline, dayKey } from '../mock/seed';
import { nowIso, tryApi } from './shared';

type LatestMarketRow = {
  symbol: string;
  price: number;
  pricedAt: string;
  source: string;
};

export const getMarketsPageData = async () => {
  const apiRows = await tryApi<LatestMarketRow[]>(
    '/finances/markets/latest?limit=50',
  );
  const mockRows = getMarkets();

  if (apiRows && apiRows.length > 0) {
    const merged = apiRows.map((row) => {
      const mock = mockRows.find((entry) => entry.symbol === row.symbol);
      return {
        symbol: row.symbol,
        name: mock?.name ?? row.symbol,
        category: mock?.category ?? 'stock',
        price: row.price,
        dayChangePct: mock?.dayChangePct ?? 0,
        volume: mock?.volume ?? 0,
        sparkline:
          mock?.sparkline ??
          buildSparkline(`${row.symbol}-${dayKey()}`, 20, row.price),
      };
    });

    return {
      rows: merged,
      asOfIso: apiRows[0]?.pricedAt ?? nowIso(),
      source: 'api',
    };
  }

  const dailyMeta = getDailyPriceMeta();
  return {
    rows: mockRows,
    asOfIso: dailyMeta.asOfIso,
    source: 'mock',
  };
};
