import { cache } from 'react';
import { apiRequest } from '../api';
import type { OverviewRange, OverviewState } from '../dashboard-types';
import { loadAccountsData } from './accounts-data';
import { loadAssetsData } from './assets-data';
import { loadOverview } from './overview-data';
import { loadTransactionsData } from './transactions-data';

type TaxSummary = {
  year: number;
  realizedGainLossEur: number;
};

export const loadServerAccountsData = cache(async () => loadAccountsData());

export const loadServerAssetsData = cache(async (withHoldings = false) =>
  loadAssetsData({ withHoldings }),
);

export const loadServerOverview = cache(
  async (
    range: OverviewRange = '1M',
    accountId = 'all',
  ): Promise<OverviewState> => loadOverview(range, accountId),
);

export const loadServerTransactionsData = cache(
  async (accountId?: string, limit?: number, cursor?: string) =>
    loadTransactionsData({
      ...(accountId ? { accountId } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
    }),
);

export const loadServerTaxSummary = cache(async (taxYear: number) =>
  apiRequest<TaxSummary>(`/finances/tax/yearly-summary?year=${taxYear}`, {
    next: {
      revalidate: 300,
    },
  }),
);
