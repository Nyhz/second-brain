'use client';

import { Card, DataTable, KpiCard, PriceLineChart } from '@second-brain/ui';
import { formatMoney } from '../lib/format';
import type { AllocationRow, HoldingRow, TimePoint } from '../lib/mock/types';

export function PortfolioDashboard({
  holdings,
  series,
  allocation,
  source,
  asOfIso,
}: {
  holdings: HoldingRow[];
  series: TimePoint[];
  allocation: AllocationRow[];
  source: 'api' | 'mock';
  asOfIso: string;
}) {
  const total = holdings.reduce((sum, row) => sum + row.value, 0);
  const winners = holdings.filter((row) => row.dayChangePct > 0).length;
  const losers = holdings.filter((row) => row.dayChangePct <= 0).length;

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <header>
        <h1>Portfolio</h1>
        <p className="small">Interactive holdings and allocation analytics.</p>
        <p className="small">
          Source: {source.toUpperCase()} · As of{' '}
          {new Date(asOfIso).toLocaleString()}
        </p>
      </header>

      <section
        className="grid kpi"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}
      >
        <KpiCard label="Portfolio Value" value={formatMoney(total)} />
        <KpiCard label="Winning Positions" value={String(winners)} />
        <KpiCard label="Losing Positions" value={String(losers)} />
      </section>

      <div
        className="grid"
        style={{ gridTemplateColumns: '2fr 1fr', gap: '1rem' }}
      >
        <Card title="30-Day Performance">
          <PriceLineChart data={series} />
        </Card>
        <Card title="Allocation Breakdown">
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
        </Card>
      </div>

      <Card title="Holdings Table">
        <DataTable
          columns={[
            {
              key: 's',
              header: 'Symbol',
              render: (row: HoldingRow) => row.symbol,
            },
            { key: 'n', header: 'Name', render: (row: HoldingRow) => row.name },
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
      </Card>
    </div>
  );
}
