import type { AssetWithPosition } from '@second-brain/types';
import {
  getAllocation,
  getHoldings,
  getPortfolioSeries,
} from '../mock/portfolio';
import { buildSparkline } from '../mock/seed';
import { nowIso, tryApi } from './shared';

export const getPortfolioPageData = async () => {
  const assets = await tryApi<AssetWithPosition[]>('/finances/assets');
  if (assets && assets.length > 0) {
    const priced = assets.filter((asset) => asset.currentValue !== null);
    const holdings = priced.map((asset) => ({
      symbol: asset.symbol ?? asset.name.slice(0, 5).toUpperCase(),
      name: asset.name,
      type: asset.assetType,
      price: asset.resolvedUnitPrice ?? 0,
      dayChangePct: 0,
      quantity: asset.position?.quantity ?? 1,
      value: asset.currentValue ?? 0,
      sparkline: buildSparkline(asset.id, 16, asset.currentValue ?? 100),
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
      holdings,
      allocation,
      series: getPortfolioSeries(),
      source: 'api' as const,
      asOfIso: nowIso(),
    };
  }

  return {
    holdings: getHoldings(),
    allocation: getAllocation(),
    series: getPortfolioSeries(),
    source: 'mock' as const,
    asOfIso: nowIso(),
  };
};
