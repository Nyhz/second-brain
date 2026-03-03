import { getAllocation, getHoldings, getPortfolioSeries } from './portfolio';

export const getOverviewData = () => {
  const series = getPortfolioSeries();
  const holdings = getHoldings();
  const allocation = getAllocation();
  const netWorth = series[series.length - 1]?.value ?? 0;
  const prev = series[series.length - 2]?.value ?? netWorth;
  const dayDeltaPct =
    prev === 0 ? 0 : Number((((netWorth - prev) / prev) * 100).toFixed(2));
  const cash = 18420.55;
  const invested = Number((netWorth - cash).toFixed(2));

  return {
    series,
    holdings,
    allocation,
    kpis: {
      netWorth,
      dayDeltaPct,
      invested,
      cash,
      positions: holdings.length,
    },
  };
};
