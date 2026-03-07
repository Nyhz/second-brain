'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '../../ui/button';
import { EmptyState, LoadingSkeleton } from '../../ui/states';

const AccountsCashTrendChart = dynamic(
  () =>
    import('./accounts-cash-trend-chart').then((module) => ({
      default: module.AccountsCashTrendChart,
    })),
  {
    loading: () => <LoadingSkeleton lines={6} />,
    ssr: false,
  },
);

export function AccountsCashTrendSection({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const [isChartVisible, setIsChartVisible] = useState(false);

  return (
    <section className="rounded-xl border border-border/70 bg-card/95 text-card-foreground shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
        <h3 className="text-sm font-semibold tracking-tight">
          Savings Cash Trend
        </h3>
        {data.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setIsChartVisible((current) => !current)}
          >
            {isChartVisible ? 'Hide Chart' : 'Load Chart'}
          </Button>
        ) : null}
      </header>
      <div className="px-5 py-4">
        {data.length === 0 ? (
          <EmptyState message="No savings balances to chart yet." />
        ) : isChartVisible ? (
          <div className="sb-sensitive-chart">
            <AccountsCashTrendChart data={data} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chart code stays deferred until you open it.
          </p>
        )}
      </div>
    </section>
  );
}
