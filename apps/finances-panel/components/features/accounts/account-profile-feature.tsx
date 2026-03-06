'use client';

import type { OverviewPositionRow, OverviewRange, OverviewState } from '../../../lib/dashboard-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadOverview } from '../../../lib/data/overview-data';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import {
  AreaPerformanceChart,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
} from '../../ui';

const RANGES: OverviewRange[] = ['1W', '1M', 'YTD', '1Y', 'MAX'];

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatSignedMoney = (value: number) => {
  const amount = formatMoney(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${amount}`;
};

const toLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const labelForPoint = (iso: string, range: OverviewRange) => {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return iso;
  if (range === '1W' || range === '1M') {
    return date.toISOString().slice(5, 10);
  }
  return date.toISOString().slice(0, 10);
};

const formatOverviewQuantity = (row: OverviewPositionRow) => {
  if (row.assetType === 'crypto') {
    return row.quantity.toFixed(4);
  }
  return row.quantity.toFixed(0);
};

const accountTypeLabel = (accountType: string) => {
  if (accountType === 'brokerage') return 'Broker';
  if (accountType === 'crypto_exchange') return 'Exchange';
  if (accountType === 'investment_platform') return 'Investment Fund Account';
  if (accountType === 'retirement_plan') return 'Retirement Plan';
  if (accountType === 'savings') return 'Savings';
  return toLabel(accountType);
};

export function AccountProfileFeature({ accountId }: { accountId: string }) {
  const [data, setData] = useState<OverviewState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<OverviewRange>('1M');

  const load = useCallback(
    async (range: OverviewRange) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await loadOverview(range, accountId);
        setData(response);
        setActiveRange(response.range);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    void load('1M');
  }, [load]);

  const selectedAccount = useMemo(() => {
    if (!data) return null;
    return data.accounts.find((account) => account.id === accountId) ?? null;
  }, [accountId, data]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.series.map((point) => ({
      label: labelForPoint(point.tsIso, data.range),
      marketIndex: point.marketIndex,
      totalValue: point.totalValue,
      dateIso: point.tsIso,
    }));
  }, [data]);

  const allocationByAsset = useMemo(() => {
    if (!data) return [];
    const total = data.positions.reduce(
      (sum, row) => sum + row.currentTotalEur,
      0,
    );
    const sorted = [...data.positions].sort(
      (a, b) => b.currentTotalEur - a.currentTotalEur,
    );
    return sorted.map((row) => ({
      label: `${row.symbol} · ${row.name}`,
      value: row.currentTotalEur,
      weightPct:
        total <= 0 ? 0 : Number(((row.currentTotalEur / total) * 100).toFixed(2)),
    }));
  }, [data]);

  if (isLoading && data === null) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton lines={3} />
        <LoadingSkeleton lines={8} />
      </div>
    );
  }

  if (errorMessage && data === null) {
    return (
      <div className="space-y-3">
        <ErrorState message={errorMessage} />
        <Button type="button" variant="secondary" onClick={() => void load(activeRange)}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || !selectedAccount) {
    return <ErrorState message="Account not found." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{selectedAccount.name}</h1>
          <p className="small">
            {accountTypeLabel(selectedAccount.accountType)} · As of{' '}
            {formatDateTime(data.asOfIso)}
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
            Range
          </p>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((range) => (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                key={range}
                className={cn(
                  'h-8 rounded-md border-border/70 bg-card/70 px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground',
                  data.range === range && 'bg-muted text-foreground',
                )}
                onClick={() => void load(range)}
                disabled={isLoading}
              >
                {range}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Value"
          value={
            <span className="sb-sensitive-value">{formatMoney(data.totalValue)}</span>
          }
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
        <KpiCard label="Open Positions" value={String(data.positions.length)} />
        <KpiCard label="Account Type" value={accountTypeLabel(selectedAccount.accountType)} />
      </section>

      <Card title="Performance">
        {chartData.length === 0 ? (
          <EmptyState message="No performance data available yet." />
        ) : (
          <div className="sb-sensitive-chart">
            <AreaPerformanceChart data={chartData} baselineValue={100} />
          </div>
        )}
      </Card>

      <section className="grid gap-4">
        <Card title="Allocation by Asset">
          {allocationByAsset.length === 0 ? (
            <EmptyState message="No positions available for asset allocation." />
          ) : (
            <div className="space-y-3">
              {allocationByAsset.map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-foreground">{item.label}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {item.weightPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-foreground/85"
                      style={{ width: `${Math.min(100, Math.max(item.weightPct, 1.5))}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground sb-sensitive-value">
                    {formatMoney(item.value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card title="Positions">
        {data.positions.length === 0 ? (
          <EmptyState message="No open positions for this account." />
        ) : (
          <DataTable
            columns={[
              {
                key: 'asset',
                header: 'Asset',
                sortValue: (row: OverviewPositionRow) => row.name,
                render: (row: OverviewPositionRow) => (
                  <div className="leading-tight">
                    <div className="font-semibold text-foreground">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.symbol}</div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                sortValue: (row: OverviewPositionRow) => toLabel(row.assetType),
                render: (row: OverviewPositionRow) => toLabel(row.assetType),
              },
              {
                key: 'qty',
                header: 'Quantity',
                sortValue: (row: OverviewPositionRow) => row.quantity,
                render: (row: OverviewPositionRow) => formatOverviewQuantity(row),
              },
              {
                key: 'avg-total',
                header: 'Avg Buy / Total',
                sortValue: (row: OverviewPositionRow) => row.avgBuyTotalEur,
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
                key: 'current',
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
            ]}
            rows={data.positions}
            rowKey={(row) => row.assetId}
          />
        )}
      </Card>
    </div>
  );
}
