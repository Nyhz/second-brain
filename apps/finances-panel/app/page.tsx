import { OverviewDashboard } from '../components/overview-dashboard';
import { getOverviewPageData } from '../lib/data/overview-data';

export default async function OverviewPage() {
  const overview = await getOverviewPageData();

  return (
    <OverviewDashboard
      series={overview.series}
      holdings={overview.holdings}
      allocation={overview.allocation}
      kpis={overview.kpis}
      dailyMeta={overview.dailyMeta}
      source={overview.source}
    />
  );
}
