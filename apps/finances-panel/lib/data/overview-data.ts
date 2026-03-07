import type { FinancesOverviewResponse } from '@second-brain/types';
import { apiRequest } from '../api';
import type { OverviewRange, OverviewState } from '../dashboard-types';

const DEFAULT_RANGE: OverviewRange = '1M';

export const loadOverview = async (
  range: OverviewRange = DEFAULT_RANGE,
  accountId = 'all',
): Promise<OverviewState> => {
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
};

export const getOverviewPageData = async (
  range: OverviewRange = DEFAULT_RANGE,
  accountId = 'all',
) => {
  return loadOverview(range, accountId);
};
