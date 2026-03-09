import { cache } from 'react';
import { apiRequest } from '../api';
import type { OverviewRange, OverviewState } from '../dashboard-types';
import { loadAccountsData } from './accounts-data';
import { loadAuditData } from './audit-data';
import { loadAssetsData } from './assets-data';
import { loadOverviewWithRevalidate } from './overview-data';
import { loadTransactionsData } from './transactions-data';

type TaxSummary = {
  year: number;
  realizedGainLossEur: number;
  dividendsGrossEur: number;
  dividendsWithholdingEur: number;
  dividendsNetEur: number;
  operations: {
    sells: number;
    dividends: number;
  };
};

export const loadServerAccountsData = cache(async () => loadAccountsData());

export const loadServerAssetsData = cache(async (withHoldings = false) =>
  loadAssetsData({ withHoldings }),
);

export const loadServerOverview = cache(
  async (
    range: OverviewRange = '1M',
    accountId = 'all',
  ): Promise<OverviewState> => loadOverviewWithRevalidate(range, accountId, 60),
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

export const loadServerAuditData = cache(
  async (entityType?: string, entityId?: string, limit?: number) =>
    loadAuditData({
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(limit !== undefined ? { limit } : {}),
    }),
);
