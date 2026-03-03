import { MarketsDashboard } from '../../components/markets-dashboard';
import { getMarketsPageData } from '../../lib/data/markets-data';

export default async function MarketsPage() {
  const data = await getMarketsPageData();
  return (
    <MarketsDashboard
      rows={data.rows}
      asOf={data.asOfIso}
      source={data.source}
    />
  );
}
