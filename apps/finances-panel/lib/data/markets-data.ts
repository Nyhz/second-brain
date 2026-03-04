import type { MarketRow } from '../dashboard-types';
import { nowIso, tryApi } from './shared';

type LatestMarketRow = {
  symbol: string;
  price: number;
  pricedAt: string;
  source: string;
};

export const getMarketsPageData = async () => {
  const apiRows =
    (await tryApi<LatestMarketRow[]>('/finances/markets/latest?limit=50')) ??
    [];

  const rows: MarketRow[] = apiRows.map((row) => ({
    symbol: row.symbol,
    name: row.symbol,
    category: 'stock',
    price: row.price,
    dayChangePct: 0,
    volume: 0,
    sparkline: [],
  }));

  return {
    rows,
    asOfIso: apiRows[0]?.pricedAt ?? nowIso(),
    source: 'api' as const,
  };
};
