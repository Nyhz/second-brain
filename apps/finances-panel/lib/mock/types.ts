export type TimePoint = {
  label: string;
  value: number;
};

export type AllocationRow = {
  label: string;
  value: number;
  percent: number;
  color: string;
};

export type HoldingRow = {
  symbol: string;
  name: string;
  type: string;
  price: number;
  dayChangePct: number;
  quantity: number;
  value: number;
  sparkline: Array<{ value: number }>;
};

export type MarketRow = {
  symbol: string;
  name: string;
  category: 'stock' | 'crypto' | 'etf' | 'fund';
  price: number;
  dayChangePct: number;
  volume: number;
  sparkline: Array<{ value: number }>;
};

export type DailyPriceMeta = {
  asOfIso: string;
  source: string;
};
