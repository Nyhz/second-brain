'use client';

import { useMemo, useState } from 'react';
import type {
  OverviewPositionRow,
  OverviewRange,
  OverviewState,
} from '../lib/dashboard-types';
import { loadOverview } from '../lib/data/overview-data';
import { formatDateTime, formatMoney } from '../lib/format';
import { cn } from '../lib/utils';
import {
  AreaPerformanceChart,
  Button,
  Card,
  DataTable,
  EmptyState,
  KpiCard,
  Sparkline,
} from './ui';

const RANGES: OverviewRange[] = ['1W', '1M', 'YTD', '1Y', 'MAX'];

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatSignedMoney = (value: number) => {
  const amount = formatMoney(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${amount}`;
};

const labelForPoint = (iso: string, range: OverviewRange) => {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return iso;
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
        marketIndex: point.marketIndex,
        totalValue: point.totalValue,
        dateIso: point.tsIso,
      })),
    [data.range, data.series],
  );
  const selectedAccountName =
    data.accountId === 'all'
      ? 'All Accounts'
      : (data.accounts.find((account) => account.id === data.accountId)?.name ??
        'Unknown Account');
  const selectedAccountType =
    data.accountId === 'all'
      ? null
      : (data.accounts.find((account) => account.id === data.accountId)
          ?.accountType ?? null);
  const shouldShowPositions = selectedAccountType !== 'savings';
  const filterButtonBase =
    'h-8 rounded-md border-border/70 bg-card/70 px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground';

  const onFilterChange = async (next: {
    range?: OverviewRange;
    accountId?: string;
  }) => {
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="small">
            General portfolio status with performance and open positions.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 xl:max-w-[980px] xl:flex-row xl:items-end">
          <div className="space-y-2 xl:flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
              Account
            </p>
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="Account filter"
            >
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={cn(
                  filterButtonBase,
                  data.accountId === 'all' && 'bg-muted text-foreground',
                )}
                onClick={() => void onFilterChange({ accountId: 'all' })}
                disabled={loading}
              >
                All Accounts
              </Button>
              {data.accounts.map((account) => (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  key={account.id}
                  className={cn(
                    filterButtonBase,
                    data.accountId === account.id && 'bg-muted text-foreground',
                  )}
                  onClick={() => void onFilterChange({ accountId: account.id })}
                  disabled={loading}
                >
                  {account.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2 xl:min-w-[320px]">
            <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground xl:text-right">
              Range
            </p>
            <div
              className="flex flex-wrap gap-2 xl:justify-end"
              role="tablist"
              aria-label="Range filter"
            >
              {RANGES.map((range) => (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  key={range}
                  className={cn(
                    filterButtonBase,
                    data.range === range && 'bg-muted text-foreground',
                  )}
                  onClick={() => void onFilterChange({ range })}
                  disabled={loading}
                >
                  {range}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Value"
          value={
            <span className="sb-sensitive-value">
              {formatMoney(data.totalValue)}
            </span>
          }
          subtext={`As of ${formatDateTime(data.asOfIso)}`}
        />
        <KpiCard
          label="Unrealized P/L"
          value={formatSignedPercent(data.deltaPct)}
          delta={
            <span className="sb-sensitive-value">
              {formatSignedMoney(data.deltaValue)}
            </span>
          }
        />
        <KpiCard
          label="Open Positions"
          value={String(data.positions.length)}
          subtext="Current filtered set"
        />
        <KpiCard
          label="Selection"
          value={selectedAccountName}
          subtext={data.range}
        />
      </section>

      <Card title="Performance" contentClassName="space-y-4 px-0 pb-0 pt-4">
        <div className="px-5">
          <p className="text-sm text-muted-foreground">
            Market-only performance (cash flows neutralized) · Total valuation{' '}
            <span className="sb-sensitive-value">
              {formatMoney(data.totalValue)}
            </span>{' '}
            · as of {formatDateTime(data.asOfIso)}
          </p>
        </div>

        {loading ? <p className="small px-5">Loading chart...</p> : null}
        {errorMessage ? (
          <p className="small px-5 text-destructive">{errorMessage}</p>
        ) : null}
        {chartData.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState message="No performance data available yet." />
          </div>
        ) : (
          <div className="sb-sensitive-chart">
            <AreaPerformanceChart data={chartData} baselineValue={100} />
          </div>
        )}
      </Card>

      {shouldShowPositions ? (
        <Card title="Positions" contentClassName="space-y-3">
          <p className="small">
            {selectedAccountName} · {data.range} range
          </p>
          {loading ? <p className="small">Loading positions...</p> : null}
          {data.positions.length === 0 ? (
            <EmptyState message="No open positions for this account and range." />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'asset',
                  header: 'Asset',
                  headerClassName: 'w-[36%] min-w-[260px]',
                  cellClassName: 'w-[36%] min-w-[260px]',
                  sortValue: (row: OverviewPositionRow) => row.name,
                  render: (row: OverviewPositionRow) => (
                    <div className="leading-tight">
                      <div className="font-semibold text-foreground">
                        {row.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.symbol}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'avg-total',
                  header: 'Avg Buy / Total',
                  sortValue: (row: OverviewPositionRow) =>
                    row.avgBuyTotalEur,
                  render: (row: OverviewPositionRow) =>
                    row.avgBuyTotalEur === null ? (
                      '-'
                    ) : (
                      <span className="sb-sensitive-value">
                        {formatMoney(row.avgBuyTotalEur)}
                      </span>
                    ),
                },
                {
                  key: 'cur-total',
                  header: 'Current / Total',
                  sortValue: (row: OverviewPositionRow) => row.currentTotalEur,
                  render: (row: OverviewPositionRow) => (
                    <span className="sb-sensitive-value">
                      {formatMoney(row.currentTotalEur)}
                    </span>
                  ),
                },
                {
                  key: 'pnl',
                  header: 'Unrealized P/L',
                  sortValue: (row: OverviewPositionRow) => row.periodPnlValueEur,
                  render: (row: OverviewPositionRow) => (
                    <span
                      className={
                        row.periodPnlValueEur >= 0
                          ? 'text-[hsl(var(--success))]'
                          : 'text-destructive'
                      }
                    >
                      {formatSignedPercent(row.periodPnlPct)} (
                      <span className="sb-sensitive-value">
                        {formatSignedMoney(row.periodPnlValueEur)}
                      </span>
                      )
                    </span>
                  ),
                },
                {
                  key: 'last-7d',
                  header: 'Range trend',
                  headerClassName:
                    'w-[170px] min-w-[170px] text-right sm:w-[225px] sm:min-w-[225px] [&_button]:ml-auto',
                  cellClassName:
                    'w-[170px] min-w-[170px] text-right sm:w-[225px] sm:min-w-[225px]',
                  sortValue: (row: OverviewPositionRow) =>
                    row.rangeIndex[row.rangeIndex.length - 1] ?? null,
                  render: (row: OverviewPositionRow) =>
                    row.rangeIndex.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No data
                      </span>
                    ) : (
                      <div className="ml-auto w-[170px] sm:w-[225px]">
                        <Sparkline
                          data={row.rangeIndex.map((value) => ({ value }))}
                          width="100%"
                          height={38}
                        />
                      </div>
                    ),
                },
              ]}
              rows={data.positions}
              rowKey={(row) => row.assetId}
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}
