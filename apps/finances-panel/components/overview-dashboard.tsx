import Link from 'next/link';
import dynamic from 'next/dynamic';
import type {
  OverviewRange,
  OverviewState,
} from '../lib/dashboard-types';
import { formatDateTime, formatMoney } from '../lib/format';
import { cn } from '../lib/utils';
import { OverviewChartPreloader } from './overview-chart-preloader';
import { Card } from './ui/card';
import { loadAreaPerformanceChart } from './ui/charts/area-performance-chart-loader';
import { KpiCard } from './ui/kpi-card';
import { OverviewPositionsTable } from './overview-positions-table';
import { EmptyState } from './ui/states';

const RANGES: OverviewRange[] = ['1W', '1M', 'YTD', '1Y', 'MAX'];
const filterButtonBase =
  'inline-flex h-8 items-center rounded-md border border-border/70 bg-card/70 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

const AreaPerformanceChart = dynamic(loadAreaPerformanceChart, {
  loading: () => <ChartSkeleton height={280} />,
});

const Sparkline = dynamic(
  () =>
    import('./ui/charts/sparkline').then((module) => ({
      default: module.Sparkline,
    })),
  {
    loading: () => <SparklineSkeleton />,
  },
);

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
  const data = initialData;
  const chartData = data.series.map((point) => ({
    label: labelForPoint(point.tsIso, data.range),
    marketIndex: point.marketIndex,
    totalValue: point.totalValue,
    dateIso: point.tsIso,
  }));
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

  return (
    <div className="space-y-6">
      <OverviewChartPreloader />

      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="small">
            General portfolio status with performance and open positions.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 xl:max-w-[980px] xl:flex-row xl:items-end">
          <FilterGroup
            label="Account"
            ariaLabel="Account filter"
            align="start"
            items={[
              {
                href: buildOverviewHref(data.range, 'all'),
                label: 'All Accounts',
                active: data.accountId === 'all',
              },
              ...data.accounts.map((account) => ({
                href: buildOverviewHref(data.range, account.id),
                label: account.name,
                active: data.accountId === account.id,
              })),
            ]}
          />
          <FilterGroup
            label="Range"
            ariaLabel="Range filter"
            align="end"
            items={RANGES.map((range) => ({
              href: buildOverviewHref(range, data.accountId),
              label: range,
              active: data.range === range,
            }))}
          />
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
          {data.positions.length === 0 ? (
            <EmptyState message="No open positions for this account and range." />
          ) : (
            <OverviewPositionsTable rows={data.positions} />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function FilterGroup({
  label,
  ariaLabel,
  align,
  items,
}: {
  label: string;
  ariaLabel: string;
  align: 'start' | 'end';
  items: Array<{ href: string; label: string; active: boolean }>;
}) {
  return (
    <div className={cn('space-y-2', align === 'start' && 'xl:flex-1', align === 'end' && 'xl:min-w-[320px]')}>
      <p className={cn('text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground', align === 'end' && 'xl:text-right')}>
        {label}
      </p>
      <div
        className={cn('flex flex-wrap gap-2', align === 'end' && 'xl:justify-end')}
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            prefetch={false}
            className={cn(
              filterButtonBase,
              item.active && 'bg-muted text-foreground',
            )}
            aria-current={item.active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function buildOverviewHref(range: OverviewRange, accountId: string) {
  const params = new URLSearchParams();
  params.set('range', range);
  params.set('accountId', accountId);
  return `/?${params.toString()}`;
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="w-full px-5 pb-5">
      <div
        className="animate-pulse rounded-lg border border-border/50 bg-muted/30"
        style={{ height }}
        aria-hidden="true"
      />
    </div>
  );
}

function SparklineSkeleton() {
  return (
    <div
      className="h-[38px] w-full animate-pulse rounded-md bg-muted/30"
      aria-hidden="true"
    />
  );
}
