import { buildSparkline, dayKey, seeded } from './seed';
import type { DailyPriceMeta, MarketRow } from './types';

const symbols: Array<
  Pick<MarketRow, 'symbol' | 'name' | 'category' | 'price'>
> = [
  { symbol: 'BTC', name: 'Bitcoin', category: 'crypto', price: 94310 },
  { symbol: 'ETH', name: 'Ethereum', category: 'crypto', price: 4680 },
  { symbol: 'SOL', name: 'Solana', category: 'crypto', price: 189 },
  { symbol: 'AAPL', name: 'Apple', category: 'stock', price: 224 },
  { symbol: 'MSFT', name: 'Microsoft', category: 'stock', price: 419 },
  { symbol: 'NVDA', name: 'NVIDIA', category: 'stock', price: 1124 },
  { symbol: 'SPY', name: 'SPDR S&P 500', category: 'etf', price: 612 },
  { symbol: 'QQQ', name: 'Invesco QQQ', category: 'etf', price: 542 },
  {
    symbol: 'VWELX',
    name: 'Vanguard Wellington',
    category: 'fund',
    price: 47.5,
  },
];

export const getMarkets = (): MarketRow[] => {
  const rnd = seeded(`markets-${dayKey()}`);
  return symbols.map((item) => {
    const dayChangePct = Number(((rnd() - 0.5) * 8.2).toFixed(2));
    const price = Number((item.price * (1 + dayChangePct / 100)).toFixed(2));
    return {
      ...item,
      price,
      dayChangePct,
      volume: Math.round(100000 + rnd() * 9000000),
      sparkline: buildSparkline(`${item.symbol}-${dayKey()}`, 20, item.price),
    };
  });
};

export const getDailyPriceMeta = (): DailyPriceMeta => ({
  asOfIso: `${dayKey()}T08:30:00.000Z`,
  source: 'seeded-market-mock-v1',
});
