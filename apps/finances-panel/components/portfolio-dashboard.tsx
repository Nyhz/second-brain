'use client';

import { Card, DataTable, EmptyState, KpiCard, PriceLineChart } from './ui';
import { formatDateTime, formatMoney } from '../lib/format';
import type {
  AllocationRow,
  HoldingRow,
  TimePoint,
} from '../lib/dashboard-types';

export function PortfolioDashboard({
  holdings,
  series,
  allocation,
  asOfIso,
}: {
  holdings: HoldingRow[];
  series: TimePoint[];
  allocation: AllocationRow[];
  asOfIso: string;
}) {
  const total = holdings.reduce((sum, row) => sum + row.value, 0);
  const winners = holdings.filter((row) => row.dayChangePct > 0).length;
  const losers = holdings.filter((row) => row.dayChangePct <= 0).length;

  return (
    <div className="page-stack">
      <header>
        <h1>Portfolio</h1>
        <p className="small">Interactive holdings and allocation analytics.</p>
        <p className="small">
          Source: API · As of {formatDateTime(asOfIso)}
        </p>
      </header>

      <section className="sb-grid-kpi">
        <KpiCard label="Portfolio Value" value={formatMoney(total)} />
        <KpiCard label="Winning Positions" value={String(winners)} />
        <KpiCard label="Losing Positions" value={String(losers)} />
      </section>

      <div className="grid two-col" style={{ gap: '1rem' }}>
        <Card title="30-Day Performance">
          {series.length === 0 ? (
            <EmptyState message="No performance history yet." />
          ) : (
            <PriceLineChart data={series} />
          )}
        </Card>
        <Card title="Allocation Breakdown">
          {allocation.length === 0 ? (
            <EmptyState message="No allocation data yet." />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'asset',
                  header: 'Type',
                  render: (row: AllocationRow) => row.label,
                },
                {
                  key: 'v',
                  header: 'Value',
                  render: (row: AllocationRow) => formatMoney(row.value),
                },
                {
                  key: 'p',
                  header: '%',
                  render: (row: AllocationRow) => `${row.percent}%`,
                },
              ]}
              rows={allocation}
              rowKey={(row) => row.label}
            />
          )}
        </Card>
      </div>

      <Card title="Holdings Table">
        {holdings.length === 0 ? (
          <EmptyState message="No holdings yet. Add assets and transactions first." />
        ) : (
          <DataTable
            columns={[
              {
                key: 's',
                header: 'Symbol',
                render: (row: HoldingRow) => row.symbol,
              },
              {
                key: 'n',
                header: 'Name',
                render: (row: HoldingRow) => row.name,
              },
              { key: 't', header: 'Type', render: (row: HoldingRow) => row.type },
              {
                key: 'q',
                header: 'Qty',
                render: (row: HoldingRow) => row.quantity.toString(),
              },
              {
                key: 'p',
                header: 'Price',
                render: (row: HoldingRow) => formatMoney(row.price),
              },
              {
                key: 'v',
                header: 'Value',
                render: (row: HoldingRow) => formatMoney(row.value),
              },
            ]}
            rows={holdings}
            rowKey={(row) => row.symbol}
          />
        )}
      </Card>
    </div>
  );
}
