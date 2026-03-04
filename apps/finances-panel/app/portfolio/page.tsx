import { PortfolioDashboard } from '../../components/portfolio-dashboard';
import { getPortfolioPageData } from '../../lib/data/portfolio-data';

export default async function PortfolioPage() {
  const data = await getPortfolioPageData();
  return (
    <PortfolioDashboard
      holdings={data.holdings}
      allocation={data.allocation}
      series={data.series}
      asOfIso={data.asOfIso}
    />
  );
}
