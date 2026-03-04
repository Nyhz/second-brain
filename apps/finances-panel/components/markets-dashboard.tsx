'use client';

import { Card, DataTable, EmptyState, KpiCard, Sparkline } from './ui';
import { formatDateTime, formatInteger, formatMoney } from '../lib/format';
import type { MarketRow } from '../lib/dashboard-types';

export function MarketsDashboard({
  rows,
  asOf,
  source,
}: {
  rows: MarketRow[];
  asOf: string;
  source: string;
}) {
  const topGainer = [...rows].sort(
    (a, b) => b.dayChangePct - a.dayChangePct,
  )[0];
  const topLoser = [...rows].sort((a, b) => a.dayChangePct - b.dayChangePct)[0];
  const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);

  return (
    <div className="page-stack">
      <header>
        <h1>Markets</h1>
        <p className="small">
          Daily updated market board for stocks, crypto, ETFs, and funds.
        </p>
      </header>

      <section className="sb-grid-kpi">
        <KpiCard
          label="Top Gainer"
          value={
            topGainer ? `${topGainer.symbol} ${topGainer.dayChangePct}%` : '-'
          }
        />
        <KpiCard
          label="Top Loser"
          value={
            topLoser ? `${topLoser.symbol} ${topLoser.dayChangePct}%` : '-'
          }
        />
        <KpiCard label="Daily Volume" value={formatInteger(totalVolume)} />
      </section>

      <Card title="Daily Updated Prices">
        <p className="small">
          As of {formatDateTime(asOf)} · Source: {source}
        </p>
        {rows.length === 0 ? (
          <EmptyState message="No market prices available yet." />
        ) : (
          <DataTable
            columns={[
              {
                key: 'symbol',
                header: 'Symbol',
                render: (row: MarketRow) => row.symbol,
              },
              {
                key: 'name',
                header: 'Name',
                render: (row: MarketRow) => row.name,
              },
              {
                key: 'cat',
                header: 'Category',
                render: (row: MarketRow) => row.category,
              },
              {
                key: 'price',
                header: 'Price',
                render: (row: MarketRow) => formatMoney(row.price),
              },
              {
                key: 'day',
                header: '24h %',
                render: (row: MarketRow) =>
                  `${row.dayChangePct > 0 ? '+' : ''}${row.dayChangePct}%`,
              },
              {
                key: 'vol',
                header: 'Volume',
                render: (row: MarketRow) => formatInteger(row.volume),
              },
              {
                key: 'spark',
                header: 'Trend',
                render: (row: MarketRow) =>
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
            rows={rows}
            rowKey={(row) => row.symbol}
          />
        )}
      </Card>
    </div>
  );
}
