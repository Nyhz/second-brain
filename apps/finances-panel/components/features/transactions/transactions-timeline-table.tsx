'use client';

import type { UnifiedTransactionRow } from '@second-brain/types';
import { prettyAssetType } from '../../../lib/display';
import { formatDateTime, formatMoney, formatMoneyByCurrency } from '../../../lib/format';
import { Button } from '../../ui/button';
import { DataTable } from '../../ui/data-table';
import { getTransactionFeeLabel, prettyTxType } from './transactions-shared';

const formatAmountWithCurrency = (
  amount: number | null,
  currency: string,
): string => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '-';
  }
  const normalizedCurrency = currency.trim().toUpperCase();
  const decimals = normalizedCurrency === 'EUR' || normalizedCurrency === 'USD' ? 2 : 4;
  return formatMoneyByCurrency(amount, normalizedCurrency, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export function TransactionsTimelineTable({
  rows,
  deletingTransactionId,
  getAssetName,
  onDelete,
}: {
  rows: UnifiedTransactionRow[];
  deletingTransactionId: string | null;
  getAssetName: (row: UnifiedTransactionRow) => string;
  onDelete: (row: UnifiedTransactionRow) => void;
}) {
  return (
    <DataTable
      columns={[
        {
          key: 'occurredAt',
          header: 'Date',
          sortValue: (row: UnifiedTransactionRow) => new Date(row.occurredAt),
          render: (row: UnifiedTransactionRow) => formatDateTime(row.occurredAt),
        },
        {
          key: 'type',
          header: 'Type',
          sortValue: (row: UnifiedTransactionRow) => prettyTxType(row),
          render: (row: UnifiedTransactionRow) => prettyTxType(row),
        },
        {
          key: 'asset',
          header: 'Asset',
          sortValue: (row: UnifiedTransactionRow) => getAssetName(row),
          render: (row: UnifiedTransactionRow) => getAssetName(row),
        },
        {
          key: 'assetType',
          header: 'Asset Type',
          sortValue: (row: UnifiedTransactionRow) =>
            prettyAssetType(row.assetType),
          render: (row: UnifiedTransactionRow) =>
            prettyAssetType(row.assetType),
        },
        {
          key: 'native',
          header: 'Amount',
          sortValue: (row: UnifiedTransactionRow) => row.amountNative,
          render: (row: UnifiedTransactionRow) => (
            <span className="sb-sensitive-value">
              {formatAmountWithCurrency(row.amountNative, row.currency)}
            </span>
          ),
        },
        {
          key: 'cash',
          header: 'Cash Impact EUR',
          sortValue: (row: UnifiedTransactionRow) => row.cashImpactEur,
          render: (row: UnifiedTransactionRow) => (
            <span className="sb-sensitive-value">
              {formatMoney(row.cashImpactEur)}
            </span>
          ),
        },
        {
          key: 'fee',
          header: 'Fee',
          sortValue: (row: UnifiedTransactionRow) => row.feesAmountEur ?? null,
          render: (row: UnifiedTransactionRow) => (
            <span className="sb-sensitive-value">
              {getTransactionFeeLabel(row)}
            </span>
          ),
        },
        {
          key: 'actions',
          header: 'Actions',
          render: (row: UnifiedTransactionRow) =>
            row.rowKind === 'asset_transaction' ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deletingTransactionId === row.id}
                onClick={() => onDelete(row)}
              >
                {deletingTransactionId === row.id ? 'Deleting...' : 'Delete'}
              </Button>
            ) : (
              '-'
            ),
        },
      ]}
      rows={rows}
      rowKey={(row) => row.id}
    />
  );
}
