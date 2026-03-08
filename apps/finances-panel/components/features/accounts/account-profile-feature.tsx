'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account, AssetWithPosition, UnifiedTransactionRow } from '@second-brain/types';
import type { OverviewRange, OverviewState } from '../../../lib/dashboard-types';
import { loadOverview } from '../../../lib/data/overview-data';
import { accountTypeLabel } from '../../../lib/display';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { AccountProfileExportModal } from './account-profile-export-modal';
import { TransactionsHeaderActions } from '../transactions/transactions-header-actions';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { CollapsibleCard } from '../../ui/collapsible-card';
import { KpiCard } from '../../ui/kpi-card';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../ui/states';

const AccountProfilePerformanceChart = dynamic(
  () =>
    import('./account-profile-performance-chart').then((module) => ({
      default: module.AccountProfilePerformanceChart,
    })),
  {
    loading: () => <LoadingSkeleton lines={6} />,
  },
);

const AccountProfilePositionsTable = dynamic(
  () =>
    import('./account-profile-positions-table').then((module) => ({
      default: module.AccountProfilePositionsTable,
    })),
  {
    loading: () => <LoadingSkeleton lines={7} />,
  },
);

const TransactionsTimeline = dynamic(
  () =>
    import('../transactions/transactions-timeline').then((module) => ({
      default: module.TransactionsTimeline,
    })),
  {
    loading: () => <LoadingSkeleton lines={7} />,
  },
);

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

type AccountProfileFeatureProps = {
  accountId: string;
  accounts: Account[];
  assets: AssetWithPosition[];
  initialData?: OverviewState;
  initialTransactions?: UnifiedTransactionRow[];
  transactionsPage: number;
  transactionsPageSize: number;
  transactionsTotalPages: number;
  transactionsTotalRows: number;
};

export function AccountProfileFeature({
  accountId,
  accounts,
  assets,
  initialData,
  initialTransactions = [],
  transactionsPage,
  transactionsPageSize,
  transactionsTotalPages,
  transactionsTotalRows,
}: AccountProfileFeatureProps) {
  const [data, setData] = useState<OverviewState | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(initialData === undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<OverviewRange>(
    initialData?.range ?? '1M',
  );

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
    if (initialData !== undefined) {
      return;
    }
    void load('1M');
  }, [initialData, load]);

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

  const accountAssetNameById = useMemo(
    () =>
      Object.fromEntries(
        data?.positions.map((position) => [position.assetId, position.name]) ?? [],
      ),
    [data],
  );

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
        total <= 0
          ? 0
          : Number(((row.currentTotalEur / total) * 100).toFixed(2)),
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
        <Button
          type="button"
          variant="secondary"
          onClick={() => void load(activeRange)}
        >
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
          <h1 className="text-2xl font-semibold tracking-tight">
            {selectedAccount.name}
          </h1>
          <p className="small">
            {accountTypeLabel(selectedAccount.accountType)} · As of{' '}
            {formatDateTime(data.asOfIso)}
          </p>
        </div>
        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap justify-end gap-2">
            <TransactionsHeaderActions
              accounts={accounts}
              assets={assets}
              defaultAccountId={accountId}
              lockAccountId
            />
            <AccountProfileExportModal accountId={accountId} />
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
        </div>
      </header>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Value"
          value={
            <span className="sb-sensitive-value">
              {formatMoney(data.totalValue)}
            </span>
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
        <KpiCard
          label="Account Type"
          value={accountTypeLabel(selectedAccount.accountType)}
        />
      </section>

      <Card title="Performance">
        {chartData.length === 0 ? (
          <EmptyState message="No performance data available yet." />
        ) : (
          <div className="sb-sensitive-chart">
            <AccountProfilePerformanceChart data={chartData} />
          </div>
        )}
      </Card>

      <section className="grid gap-4">
        <CollapsibleCard title="Allocation by Asset">
          {allocationByAsset.length === 0 ? (
            <EmptyState message="No positions available for asset allocation." />
          ) : (
            <div className="space-y-3">
              {allocationByAsset.map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-foreground">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {item.weightPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-foreground/85"
                      style={{
                        width: `${Math.min(100, Math.max(item.weightPct, 1.5))}%`,
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground sb-sensitive-value">
                    {formatMoney(item.value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleCard>
      </section>

      <CollapsibleCard title="Positions">
        {data.positions.length === 0 ? (
          <EmptyState message="No open positions for this account." />
        ) : (
          <AccountProfilePositionsTable rows={data.positions} />
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Transactions">
        <TransactionsTimeline
          assetNameById={accountAssetNameById}
          assetTypeFilter="all"
          assetTypeFilterOptions={[]}
          assetFilter="all"
          assetFilterOptions={[]}
          page={transactionsPage}
          pageParamName="txPage"
          pageSize={transactionsPageSize}
          pageSizeParamName="txPageSize"
          rows={initialTransactions}
          showFilters={false}
          totalPages={transactionsTotalPages}
          totalRows={transactionsTotalRows}
          typeFilter="all"
          typeFilterOptions={[]}
          emptyMessage="No transactions for this account."
          wrapInCard={false}
        />
      </CollapsibleCard>
    </div>
  );
}
