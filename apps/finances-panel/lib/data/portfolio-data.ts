import type { AssetWithPosition } from '@second-brain/types';
import type { AllocationRow, HoldingRow, TimePoint } from '../dashboard-types';
import { nowIso, tryApi } from './shared';

const COLORS = ['#e5e7eb', '#9ca3af', '#6b7280', '#4b5563', '#374151'];

export const getPortfolioPageData = async () => {
  const assets = (await tryApi<AssetWithPosition[]>('/finances/assets')) ?? [];
  const priced = assets.filter((asset) => asset.currentValue !== null);

  const holdings: HoldingRow[] = priced.map((asset) => ({
    symbol: asset.symbol ?? asset.ticker ?? asset.name.slice(0, 5).toUpperCase(),
    name: asset.name,
    type: asset.assetType,
    price: asset.resolvedUnitPrice ?? 0,
    dayChangePct: 0,
    quantity: asset.position?.quantity ?? 0,
    value: asset.currentValue ?? 0,
    sparkline: [],
  }));

  const byType = new Map<string, number>();
  for (const row of holdings) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + row.value);
  }
  const total = holdings.reduce((sum, row) => sum + row.value, 0);
  const allocation: AllocationRow[] = [...byType.entries()].map(
    ([label, value], idx) => ({
      label,
      value,
      percent: total === 0 ? 0 : Number(((value / total) * 100).toFixed(2)),
      color: COLORS[idx % COLORS.length] ?? COLORS[0] ?? '#e5e7eb',
    }),
  );

  const series: TimePoint[] = [];

  return {
    holdings,
    allocation,
    series,
    source: 'api' as const,
    asOfIso: nowIso(),
  };
};
