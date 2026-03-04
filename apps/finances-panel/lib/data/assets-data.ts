import type { AssetWithPosition } from '@second-brain/types';
import type { HoldingRow, MarketRow, TimePoint } from '../dashboard-types';
import { tryApi } from './shared';

const COLORS = ['#e5e7eb', '#9ca3af', '#6b7280', '#4b5563', '#374151'];

export const loadAssetsData = async () => {
  const rows = (await tryApi<AssetWithPosition[]>('/finances/assets')) ?? [];
  const marketRows =
    (await tryApi<
      Array<{
        symbol: string;
        price: number;
        source: string;
      }>
    >('/finances/markets/latest?limit=50')) ?? [];

  const holdings: HoldingRow[] = rows.map((asset) => ({
    symbol: asset.symbol ?? asset.ticker ?? asset.name.slice(0, 5).toUpperCase(),
    name: asset.name,
    type: asset.assetType,
    quantity: asset.position?.quantity ?? 0,
    price: asset.resolvedUnitPrice ?? 0,
    value: asset.currentValue ?? 0,
    dayChangePct: 0,
    sparkline: [],
  }));

  const byType = new Map<string, number>();
  for (const row of holdings) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + row.value);
  }
  const total = holdings.reduce((sum, row) => sum + row.value, 0);
  const allocation = [...byType.entries()].map(([label, value], idx) => ({
    label,
    value,
    percent: total === 0 ? 0 : Number(((value / total) * 100).toFixed(2)),
    color: COLORS[idx % COLORS.length] ?? COLORS[0] ?? '#e5e7eb',
  }));

  const markets: MarketRow[] = marketRows.map((row) => ({
    symbol: row.symbol,
    name: row.symbol,
    category: 'stock',
    price: row.price,
    dayChangePct: 0,
    volume: 0,
    sparkline: [],
  }));

  const series: TimePoint[] = [];

  return {
    rows,
    holdings,
    allocation,
    series,
    markets,
  } as const;
};
