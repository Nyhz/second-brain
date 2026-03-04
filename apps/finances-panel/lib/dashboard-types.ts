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

export type OverviewRange = '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'MAX';

export type OverviewAccountTab = {
  id: string;
  name: string;
};

export type OverviewSeriesRow = {
  tsIso: string;
  value: number;
};

export type OverviewPositionRow = {
  assetId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgBuyUnitEur: number | null;
  avgBuyTotalEur: number | null;
  currentUnitEur: number;
  currentTotalEur: number;
  periodPnlValueEur: number;
  periodPnlPct: number;
};

export type OverviewState = {
  range: OverviewRange;
  rangeStartIso: string;
  accountId: string;
  asOfIso: string;
  previousAsOfIso: string | null;
  totalValue: number;
  deltaValue: number;
  deltaPct: number;
  accounts: OverviewAccountTab[];
  series: OverviewSeriesRow[];
  positions: OverviewPositionRow[];
};
