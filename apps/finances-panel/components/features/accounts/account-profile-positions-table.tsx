'use client';

import type { OverviewPositionRow } from '../../../lib/dashboard-types';
import { prettyAssetType } from '../../../lib/display';
import { formatMoney } from '../../../lib/format';
import { DataTable } from '../../ui/data-table';

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatSignedMoney = (value: number) => {
  const amount = formatMoney(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${amount}`;
};

const formatOverviewQuantity = (row: OverviewPositionRow) => {
  if (row.assetType === 'crypto') {
    return row.quantity.toFixed(4);
  }
  return row.quantity.toFixed(0);
};

export function AccountProfilePositionsTable({
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
          sortValue: (row: OverviewPositionRow) => prettyAssetType(row.assetType),
          render: (row: OverviewPositionRow) => prettyAssetType(row.assetType),
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
      rows={rows}
      rowKey={(row) => row.assetId}
    />
  );
}
