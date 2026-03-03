'use client';

import {
  Card,
  DataTable,
  EmptyState,
  KpiCard,
  PageTabs,
  Sparkline,
} from '@second-brain/ui';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { formatMoney } from '../lib/format';
import type { AllocationRow, HoldingRow, TimePoint } from '../lib/mock/types';

const AreaPerformanceChart = dynamic(
  () => import('@second-brain/ui').then((mod) => mod.AreaPerformanceChart),
  { ssr: false },
);
const AllocationDonutChart = dynamic(
  () => import('@second-brain/ui').then((mod) => mod.AllocationDonutChart),
  { ssr: false },
);

type OverviewDashboardProps = {
  series: TimePoint[];
  holdings: HoldingRow[];
  allocation: AllocationRow[];
  kpis: {
    netWorth: number;
    dayDeltaPct: number;
    invested: number;
    cash: number;
    positions: number;
  };
  dailyMeta: {
    asOfIso: string;
    source: string;
  };
  source: 'api' | 'mock';
};

export function OverviewDashboard({
  series,
  holdings,
  allocation,
  kpis,
  dailyMeta,
  source,
}: OverviewDashboardProps) {
  const tabs = useMemo(
    () => [
      { id: 'performance', label: 'Performance' },
      { id: 'composition', label: 'Composition' },
      { id: 'prices', label: 'Daily Prices' },
    ],
    [],
  );
  const [activeTab, setActiveTab] = useState('performance');

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <header>
        <h1>Finances Command Center</h1>
        <p className="small">
          Dark-market dashboard preview with seeded stocks, ETFs, funds, and
          crypto.
        </p>
        <p className="small">Primary data source: {source.toUpperCase()}</p>
      </header>

      <section
        className="grid kpi"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}
      >
        <KpiCard
          label="Net Worth"
          value={formatMoney(kpis.netWorth)}
          delta={`${kpis.dayDeltaPct > 0 ? '+' : ''}${kpis.dayDeltaPct}% today`}
        />
        <KpiCard label="Invested" value={formatMoney(kpis.invested)} />
        <KpiCard label="Cash" value={formatMoney(kpis.cash)} />
        <KpiCard label="Open Positions" value={String(kpis.positions)} />
      </section>

      <PageTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'performance' ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: '2fr 1fr', gap: '1rem' }}
        >
          <Card title="Portfolio Value">
            <AreaPerformanceChart data={series} />
          </Card>
          <Card title="Top Positions">
            <DataTable
              columns={[
                {
                  key: 'symbol',
                  header: 'Asset',
                  render: (row: HoldingRow) => row.symbol,
                },
                {
                  key: 'value',
                  header: 'Value',
                  render: (row: HoldingRow) => formatMoney(row.value),
                },
                {
                  key: 'change',
                  header: '24h',
                  render: (row: HoldingRow) =>
                    `${row.dayChangePct > 0 ? '+' : ''}${row.dayChangePct}%`,
                },
              ]}
              rows={holdings.slice(0, 5)}
              rowKey={(row) => row.symbol}
            />
          </Card>
        </div>
      ) : null}

      {activeTab === 'composition' ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: '1fr 1.3fr', gap: '1rem' }}
        >
          <Card title="Asset Allocation">
            <AllocationDonutChart data={allocation} />
          </Card>
          <Card title="Composition Table">
            {allocation.length === 0 ? (
              <EmptyState message="No allocation data." />
            ) : (
              <DataTable
                columns={[
                  {
                    key: 'label',
                    header: 'Type',
                    render: (row: AllocationRow) => row.label,
                  },
                  {
                    key: 'value',
                    header: 'Value',
                    render: (row: AllocationRow) => formatMoney(row.value),
                  },
                  {
                    key: 'pct',
                    header: 'Percent',
                    render: (row: AllocationRow) => `${row.percent}%`,
                  },
                ]}
                rows={allocation}
                rowKey={(row) => row.label}
              />
            )}
          </Card>
        </div>
      ) : null}

      {activeTab === 'prices' ? (
        <Card title="Daily Updated Prices">
          <p className="small">
            As of {new Date(dailyMeta.asOfIso).toLocaleString()} · Source:{' '}
            {dailyMeta.source}
          </p>
          <DataTable
            columns={[
              {
                key: 'symbol',
                header: 'Symbol',
                render: (row: HoldingRow) => row.symbol,
              },
              {
                key: 'name',
                header: 'Name',
                render: (row: HoldingRow) => row.name,
              },
              {
                key: 'price',
                header: 'Price',
                render: (row: HoldingRow) => formatMoney(row.price),
              },
              {
                key: 'chg',
                header: '24h %',
                render: (row: HoldingRow) =>
                  `${row.dayChangePct > 0 ? '+' : ''}${row.dayChangePct}%`,
              },
              {
                key: 'spark',
                header: 'Trend',
                render: (row: HoldingRow) =>
                  row.sparkline.length > 0 ? (
                    <Sparkline
                      data={row.sparkline}
                      color={row.dayChangePct >= 0 ? '#34d399' : '#f87171'}
                    />
                  ) : (
                    '-'
                  ),
              },
            ]}
            rows={holdings}
            rowKey={(row) => row.symbol}
          />
        </Card>
      ) : null}
    </div>
  );
}
