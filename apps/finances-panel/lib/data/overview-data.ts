import type { FinancesOverviewResponse } from '@second-brain/types';
import { apiRequest } from '../api';
import type { OverviewRange, OverviewState } from '../dashboard-types';

const DEFAULT_RANGE: OverviewRange = '1M';

const emptyOverview = (
  range: OverviewRange = DEFAULT_RANGE,
  accountId = 'all',
): OverviewState => {
  const nowIso = new Date().toISOString();
  return {
    range,
    rangeStartIso: nowIso,
    accountId,
    asOfIso: nowIso,
    previousAsOfIso: null,
    totalValue: 0,
    deltaValue: 0,
    deltaPct: 0,
    accounts: [],
    series: [],
    positions: [],
  };
};

export const loadOverview = async (
  range: OverviewRange = DEFAULT_RANGE,
  accountId = 'all',
): Promise<OverviewState> => {
  try {
    const params = new URLSearchParams({
      range,
      accountId,
    });
    const response = await apiRequest<FinancesOverviewResponse>(
      `/finances/overview?${params.toString()}`,
    );
    return {
      range: response.range,
      rangeStartIso: response.rangeStartIso,
      accountId: response.accountId,
      asOfIso: response.asOfIso,
      previousAsOfIso: response.previousAsOfIso,
      totalValue: response.totalValue,
      deltaValue: response.deltaValue,
      deltaPct: response.deltaPct,
      accounts: response.accounts,
      series: response.series,
      positions: response.positions,
    };
  } catch {
    return emptyOverview(range, accountId);
  }
};

export const getOverviewPageData = async () => {
  return loadOverview(DEFAULT_RANGE, 'all');
};
