import type {
  FinancesSummary,
  PortfolioSummary,
  Transaction,
} from '@second-brain/types';
import { getDailyPriceMeta } from '../mock/markets';
import { getOverviewData } from '../mock/overview';
import type { HoldingRow } from '../mock/types';
import { nowIso, tryApi } from './shared';

export const getOverviewPageData = async () => {
  const [summary, portfolio, txRows] = await Promise.all([
    tryApi<FinancesSummary>('/finances/summary'),
    tryApi<PortfolioSummary>('/finances/portfolio/summary'),
    tryApi<Transaction[]>('/finances/transactions'),
  ]);

  if (summary && portfolio && txRows) {
    const dailyMeta = { asOfIso: nowIso(), source: 'api' as const };
    const fallback = getOverviewData();

    const kpis = {
      netWorth: portfolio.netWorth,
      dayDeltaPct:
        portfolio.netWorth === 0
          ? 0
          : Number(
              (
                ((summary.monthlyInflow + summary.monthlyOutflow) /
                  portfolio.netWorth) *
                100
              ).toFixed(2),
            ),
      invested: portfolio.assetValue,
      cash: portfolio.cashBalance,
      positions: portfolio.assetCount,
    };

    const txAsHoldings: HoldingRow[] = txRows.slice(0, 8).map((tx) => ({
      symbol: tx.category.toUpperCase().slice(0, 5),
      name: tx.description,
      type: tx.category,
      price: Math.abs(tx.amount),
      dayChangePct: tx.amount >= 0 ? 0.8 : -0.6,
      quantity: 1,
      value: Math.abs(tx.amount),
      sparkline: [
        { value: Math.abs(tx.amount) * 0.96 },
        { value: Math.abs(tx.amount) },
      ],
    }));

    return {
      series: fallback.series,
      holdings: txAsHoldings.length > 0 ? txAsHoldings : fallback.holdings,
      allocation:
        portfolio.allocationByType.length > 0
          ? portfolio.allocationByType.map((row, idx) => ({
              label: row.assetType,
              value: row.value,
              percent: row.percent,
              color:
                ['#22d3ee', '#60a5fa', '#34d399', '#f59e0b', '#a78bfa'][
                  idx % 5
                ] ?? '#22d3ee',
            }))
          : fallback.allocation,
      kpis,
      dailyMeta,
      source: 'api' as const,
    };
  }

  const mock = getOverviewData();
  return {
    ...mock,
    dailyMeta: getDailyPriceMeta(),
    source: 'mock' as const,
  };
};
