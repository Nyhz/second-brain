import { buildSeries, buildSparkline, dayKey, seeded } from './seed';
import type { AllocationRow, HoldingRow, TimePoint } from './types';

const holdingsBase = [
  { symbol: 'AAPL', name: 'Apple', type: 'stock', qty: 32, price: 224.31 },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock', qty: 21, price: 418.84 },
  { symbol: 'SPY', name: 'SPDR S&P 500', type: 'etf', qty: 15, price: 612.1 },
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', qty: 0.76, price: 94310 },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto', qty: 6.3, price: 4680 },
  {
    symbol: 'VTI',
    name: 'Vanguard Total Market',
    type: 'etf',
    qty: 28,
    price: 305.2,
  },
];

export const getPortfolioSeries = (): TimePoint[] => {
  return buildSeries(`portfolio-${dayKey()}`, 30, 126000);
};

export const getHoldings = (): HoldingRow[] => {
  const rnd = seeded(`holdings-${dayKey()}`);
  return holdingsBase.map((item) => {
    const dayChangePct = Number(((rnd() - 0.5) * 5.4).toFixed(2));
    const price = Number((item.price * (1 + dayChangePct / 100)).toFixed(2));
    const value = Number((item.qty * price).toFixed(2));
    return {
      symbol: item.symbol,
      name: item.name,
      type: item.type,
      price,
      dayChangePct,
      quantity: item.qty,
      value,
      sparkline: buildSparkline(`${item.symbol}-${dayKey()}`, 16, item.price),
    };
  });
};

export const getAllocation = (): AllocationRow[] => {
  const holdings = getHoldings();
  const totals = new Map<string, number>();
  for (const row of holdings) {
    const current = totals.get(row.type) ?? 0;
    totals.set(row.type, current + row.value);
  }
  const totalValue = [...totals.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const palette = ['#22d3ee', '#60a5fa', '#34d399', '#f59e0b', '#a78bfa'];

  return [...totals.entries()].map(([label, value], index) => ({
    label,
    value: Number(value.toFixed(2)),
    percent: Number(((value / totalValue) * 100).toFixed(2)),
    color: palette[index % palette.length] ?? '#22d3ee',
  }));
};
