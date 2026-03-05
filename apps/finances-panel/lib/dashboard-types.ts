import type { AssetType } from '@second-brain/types';

export type OverviewRange = '1W' | '1M' | 'YTD' | '1Y' | 'MAX';

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
  assetType: AssetType;
  symbol: string;
  name: string;
  quoteCurrency: string;
  quantity: number;
  currentUnitQuote: number;
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
