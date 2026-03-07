import { OverviewDashboard } from '../components/overview-dashboard';
import { loadServerOverview } from '../lib/data/server-data';
import type { OverviewRange } from '../lib/dashboard-types';

const VALID_RANGES: OverviewRange[] = ['1W', '1M', 'YTD', '1Y', 'MAX'];

const getSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const rangeParam = getSingleSearchParam(resolvedSearchParams.range);
  const accountIdParam = getSingleSearchParam(resolvedSearchParams.accountId);
  const range = VALID_RANGES.includes(rangeParam as OverviewRange)
    ? (rangeParam as OverviewRange)
    : undefined;
  const accountId =
    accountIdParam && accountIdParam.length > 0 ? accountIdParam : undefined;
  const initialData = await loadServerOverview(range, accountId);

  return <OverviewDashboard initialData={initialData} />;
}
