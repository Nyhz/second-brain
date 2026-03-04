import { OverviewDashboard } from '../components/overview-dashboard';
import { getOverviewPageData } from '../lib/data/overview-data';

export default async function OverviewPage() {
  const initialData = await getOverviewPageData();

  return <OverviewDashboard initialData={initialData} />;
}
