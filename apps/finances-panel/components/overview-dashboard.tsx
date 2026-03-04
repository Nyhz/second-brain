'use client';

import { AreaPerformanceChart, Card, DataTable, EmptyState } from './ui';
import { useMemo, useState } from 'react';
import type {
  OverviewPositionRow,
  OverviewRange,
  OverviewState,
} from '../lib/dashboard-types';
import { loadOverview } from '../lib/data/overview-data';
import { formatDateTime, formatMoney } from '../lib/format';

const RANGES: OverviewRange[] = ['1D', '1W', '1M', 'YTD', '1Y', 'MAX'];

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatSignedMoney = (value: number) => {
  const amount = formatMoney(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${amount}`;
};

const labelForPoint = (iso: string, range: OverviewRange) => {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return iso;
  if (range === '1D') {
    return date.toISOString().slice(11, 16);
  }
  if (range === '1W' || range === '1M') {
    return date.toISOString().slice(5, 10);
  }
  return date.toISOString().slice(0, 10);
};

type OverviewDashboardProps = {
  initialData: OverviewState;
};

export function OverviewDashboard({ initialData }: OverviewDashboardProps) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chartData = useMemo(
    () =>
      data.series.map((point) => ({
        label: labelForPoint(point.tsIso, data.range),
        value: point.value,
      })),
    [data.range, data.series],
  );

  const onFilterChange = async (next: { range?: OverviewRange; accountId?: string }) => {
    const nextRange = next.range ?? data.range;
    const nextAccountId = next.accountId ?? data.accountId;
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextData = await loadOverview(nextRange, nextAccountId);
      setData(nextData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header-wrap">
        <h1>Overview</h1>
        <p className="small">General portfolio status with performance and open positions.</p>
      </header>

      <Card title="Performance">
        <div className="overview-controls">
          <div className="overview-tabs" role="tablist" aria-label="Account filter">
            <button
              type="button"
              className={data.accountId === 'all' ? 'is-active' : ''}
              onClick={() => void onFilterChange({ accountId: 'all' })}
              disabled={loading}
            >
              All Accounts
            </button>
            {data.accounts.map((account) => (
              <button
                type="button"
                key={account.id}
                className={data.accountId === account.id ? 'is-active' : ''}
                onClick={() => void onFilterChange({ accountId: account.id })}
                disabled={loading}
              >
                {account.name}
              </button>
            ))}
          </div>
          <div className="overview-tabs" role="tablist" aria-label="Range filter">
            {RANGES.map((range) => (
              <button
                type="button"
                key={range}
                className={data.range === range ? 'is-active' : ''}
                onClick={() => void onFilterChange({ range })}
                disabled={loading}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="overview-delta-wrap">
          <strong
            className={data.deltaValue >= 0 ? 'overview-positive' : 'overview-negative'}
          >
            {formatSignedPercent(data.deltaPct)} ({formatSignedMoney(data.deltaValue)})
          </strong>
          <span className="small">
            Total {formatMoney(data.totalValue)} · as of {formatDateTime(data.asOfIso)}
          </span>
        </div>

        {loading ? <p className="small">Loading chart...</p> : null}
        {errorMessage ? <p className="small overview-negative">{errorMessage}</p> : null}
        {chartData.length === 0 ? (
          <EmptyState message="No performance data available yet." />
        ) : (
          <AreaPerformanceChart data={chartData} />
        )}
      </Card>

      <Card title="Positions">
        {loading ? <p className="small">Loading positions...</p> : null}
        {data.positions.length === 0 ? (
          <EmptyState message="No open positions for this account and range." />
        ) : (
          <DataTable
            columns={[
              {
                key: 'asset',
                header: 'Asset',
                render: (row: OverviewPositionRow) => (
                  <div>
                    <strong>{row.symbol}</strong>
                    <div className="small">{row.name}</div>
                  </div>
                ),
              },
              {
                key: 'qty',
                header: 'Quantity',
                render: (row: OverviewPositionRow) => row.quantity.toFixed(6),
              },
              {
                key: 'avg-unit',
                header: 'Avg Buy / Unit',
                render: (row: OverviewPositionRow) =>
                  row.avgBuyUnitEur === null ? '-' : formatMoney(row.avgBuyUnitEur),
              },
              {
                key: 'avg-total',
                header: 'Avg Buy / Total',
                render: (row: OverviewPositionRow) =>
                  row.avgBuyTotalEur === null ? '-' : formatMoney(row.avgBuyTotalEur),
              },
              {
                key: 'cur-unit',
                header: 'Current / Unit',
                render: (row: OverviewPositionRow) =>
                  formatMoney(row.currentUnitEur),
              },
              {
                key: 'cur-total',
                header: 'Current / Total',
                render: (row: OverviewPositionRow) =>
                  formatMoney(row.currentTotalEur),
              },
              {
                key: 'pnl',
                header: `P/L ${data.range}`,
                render: (row: OverviewPositionRow) => (
                  <span
                    className={
                      row.periodPnlValueEur >= 0
                        ? 'overview-positive'
                        : 'overview-negative'
                    }
                  >
                    {formatSignedPercent(row.periodPnlPct)} (
                    {formatSignedMoney(row.periodPnlValueEur)})
                  </span>
                ),
              },
            ]}
            rows={data.positions}
            rowKey={(row) => row.assetId}
          />
        )}
      </Card>
    </div>
  );
}
