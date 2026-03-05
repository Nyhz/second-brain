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
} from './ui';

const RANGES: OverviewRange[] = ['1W', '1M', 'YTD', '1Y', 'MAX'];

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatSignedMoney = (value: number) => {
  const amount = formatMoney(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${amount}`;
};

const formatQuoteUnit = (value: number, currency: string) => {
  const normalized = currency.trim().toUpperCase();
  const amount = Number.isFinite(value) ? value.toFixed(4) : '0.0000';
  return `${amount} ${normalized}`;
};

const formatOverviewQuantity = (row: OverviewPositionRow) => {
  if (row.assetType === 'crypto') {
    return row.quantity.toFixed(4);
  }
  return row.quantity.toFixed(0);
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
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
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
              Range
            </p>
            <div
              className="flex flex-wrap gap-2"
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
          value={formatMoney(data.totalValue)}
          subtext={`As of ${formatDateTime(data.asOfIso)}`}
        />
        <KpiCard
          label={`Return ${data.range}`}
          value={formatSignedPercent(data.deltaPct)}
          delta={formatSignedMoney(data.deltaValue)}
          subtext={
            data.deltaValue >= 0 ? 'Positive momentum' : 'Drawdown period'
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
            Market-only performance (cash flows neutralized) · Total valuation {formatMoney(data.totalValue)} · as of{' '}
            {formatDateTime(data.asOfIso)}
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
          <AreaPerformanceChart
            data={chartData}
            baselineValue={100}
          />
        )}
      </Card>

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
                render: (row: OverviewPositionRow) =>
                  formatOverviewQuantity(row),
              },
              {
                key: 'avg-unit',
                header: 'Avg Buy / Unit',
                render: (row: OverviewPositionRow) =>
                  row.avgBuyUnitEur === null
                    ? '-'
                    : formatMoney(row.avgBuyUnitEur),
              },
              {
                key: 'avg-total',
                header: 'Avg Buy / Total',
                render: (row: OverviewPositionRow) =>
                  row.avgBuyTotalEur === null
                    ? '-'
                    : formatMoney(row.avgBuyTotalEur),
              },
              {
                key: 'cur-unit-quote',
                header: 'Current / Unit (Quote)',
                render: (row: OverviewPositionRow) =>
                  formatQuoteUnit(row.currentUnitQuote, row.quoteCurrency),
              },
              {
                key: 'cur-unit',
                header: 'Current / Unit (EUR)',
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
                        ? 'text-[hsl(var(--success))]'
                        : 'text-destructive'
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
