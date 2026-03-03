import type { AssetWithPosition } from '@second-brain/types';
import { getMarkets } from '../mock/markets';
import {
  getAllocation,
  getHoldings,
  getPortfolioSeries,
} from '../mock/portfolio';
import { tryApi } from './shared';

export const loadAssetsData = async () => {
  const rows = await tryApi<AssetWithPosition[]>('/finances/assets');
  if (rows && rows.length > 0) {
    const holdings = rows.map((asset) => ({
      symbol: asset.symbol ?? asset.name.slice(0, 5).toUpperCase(),
      name: asset.name,
      type: asset.assetType,
      quantity: asset.position?.quantity ?? 1,
      price: asset.resolvedUnitPrice ?? 0,
      value: asset.currentValue ?? 0,
      dayChangePct: 0,
      sparkline: [
        { value: (asset.currentValue ?? 0) * 0.95 },
        { value: asset.currentValue ?? 0 },
      ],
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
      color:
        ['#22d3ee', '#60a5fa', '#34d399', '#f59e0b', '#a78bfa'][idx % 5] ??
        '#22d3ee',
    }));

    return {
      source: 'api' as const,
      rows,
      holdings,
      allocation,
      series: getPortfolioSeries(),
      markets: getMarkets(),
    };
  }

  return {
    source: 'mock' as const,
    rows: [],
    holdings: getHoldings(),
    allocation: getAllocation(),
    series: getPortfolioSeries(),
    markets: getMarkets(),
  };
};
