'use client';

import type { OverviewPositionRow } from '../lib/dashboard-types';
import { formatMoney } from '../lib/format';
import { DataTable } from './ui/data-table';
import { Sparkline } from './ui/charts/sparkline';

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatSignedMoney = (value: number) => {
  const amount = formatMoney(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${amount}`;
};

export function OverviewPositionsTable({
  rows,
}: {
  rows: OverviewPositionRow[];
}) {
  return (
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
              <div className="font-semibold text-foreground">{row.name}</div>
              <div className="text-xs text-muted-foreground">{row.symbol}</div>
            </div>
          ),
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
              <span className="text-xs text-muted-foreground">No data</span>
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
      rows={rows}
      rowKey={(row) => row.assetId}
    />
  );
}
