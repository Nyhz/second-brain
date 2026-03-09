'use client';

import type { UnifiedTransactionRow } from '@second-brain/types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { useRefreshMutation } from '../../../lib/use-refresh-mutation';
import { Button } from '@second-brain/ui';
import { Card } from '../../ui/card';
import { ConfirmModal } from '../../ui/confirm-modal';
import { EmptyState, ErrorState } from '../../ui/states';
import { TransactionsTimelineTable } from './transactions-timeline-table';
import { prettyTxType, type TimelineFilterOption } from './transactions-shared';

type TransactionsTimelineProps = {
  assetNameById: Record<string, string>;
  assetTypeFilter: string;
  assetTypeFilterOptions: TimelineFilterOption[];
  assetFilter: string;
  assetFilterOptions: TimelineFilterOption[];
  page: number;
  pageSize: number;
  pageParamName?: string;
  pageSizeParamName?: string;
  rows: UnifiedTransactionRow[];
  totalPages: number;
  totalRows: number;
  title?: string;
  typeFilter: string;
  typeFilterOptions: TimelineFilterOption[];
  showFilters?: boolean;
  emptyMessage?: string;
  wrapInCard?: boolean;
};

export function TransactionsTimeline({
  assetNameById,
  assetTypeFilter,
  assetTypeFilterOptions,
  assetFilter,
  assetFilterOptions,
  page,
  pageSize,
  pageParamName = 'page',
  pageSizeParamName = 'pageSize',
  rows,
  totalPages,
  totalRows,
  title = 'Transactions Timeline',
  typeFilter,
  typeFilterOptions,
  showFilters = true,
  emptyMessage = 'No transactions for the selected filters.',
  wrapInCard = true,
}: TransactionsTimelineProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirmDeleteTransaction, setConfirmDeleteTransaction] =
    useState<UnifiedTransactionRow | null>(null);
  const { errorMessage, isRefreshing, run } = useRefreshMutation();

  const getAssetName = useMemo(
    () => (row: UnifiedTransactionRow) => {
      if (!row.assetId) {
        return '-';
      }
      const assetName = assetNameById[row.assetId];
      if (assetName) {
        return assetName;
      }
      if (row.assetLabel?.includes('·')) {
        return row.assetLabel.split('·').at(-1)?.trim() ?? row.assetLabel;
      }
      return row.assetLabel ?? '-';
    },
    [assetNameById],
  );

  const updateSearch = (nextValues: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(nextValues)) {
      if (!value || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    if (!nextValues[pageParamName]) {
      params.delete(pageParamName);
    }
    const nextPath = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextPath, { scroll: false });
  };

  const confirmDelete = async () => {
    if (!confirmDeleteTransaction) {
      return;
    }
    await run(
      () =>
        apiRequest(`/finances/asset-transactions/${confirmDeleteTransaction.id}`, {
          method: 'DELETE',
        }),
      {
        onSuccess: () => {
          setConfirmDeleteTransaction(null);
        },
      },
    );
  };

  const content = (
    <>
      {showFilters ? (
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <label
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="timeline-filter-type"
            >
              Type
            </label>
            <select
              id="timeline-filter-type"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(event) =>
                updateSearch({ type: event.target.value, [pageParamName]: '1' })
              }
            >
              {typeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="timeline-filter-asset"
            >
              Asset
            </label>
            <select
              id="timeline-filter-asset"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={assetFilter}
              onChange={(event) =>
                updateSearch({ asset: event.target.value, [pageParamName]: '1' })
              }
            >
              {assetFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="timeline-filter-asset-type"
            >
              Asset Type
            </label>
            <select
              id="timeline-filter-asset-type"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={assetTypeFilter}
              onChange={(event) =>
                updateSearch({
                  assetType: event.target.value,
                  [pageParamName]: '1',
                })
              }
            >
              {assetTypeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      {rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          <TransactionsTimelineTable
            rows={rows}
            deletingTransactionId={
              isRefreshing ? confirmDeleteTransaction?.id ?? null : null
            }
            getAssetName={getAssetName}
            onDelete={(row) => setConfirmDeleteTransaction(row)}
          />
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalRows)} of{' '}
              {totalRows}
            </p>
            <div className="flex items-center gap-2">
              <label
                className="text-xs uppercase tracking-wide"
                htmlFor="timeline-page-size"
              >
                Rows
              </label>
              <select
                id="timeline-page-size"
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={pageSize}
                onChange={(event) =>
                  updateSearch({
                    [pageSizeParamName]: event.target.value,
                    [pageParamName]: '1',
                  })
                }
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() =>
                  updateSearch({
                    [pageParamName]: String(Math.max(1, page - 1)),
                  })
                }
              >
                Previous
              </Button>
              <span>
                Page {page} / {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() =>
                  updateSearch({
                    [pageParamName]: String(Math.min(totalPages, page + 1)),
                  })
                }
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={Boolean(confirmDeleteTransaction)}
        title="Delete Transaction"
        description={
          confirmDeleteTransaction
            ? `Delete ${prettyTxType(confirmDeleteTransaction)} transaction from ${formatDateTime(
                confirmDeleteTransaction.occurredAt,
              )}?`
            : ''
        }
        confirmLabel="Delete Transaction"
        confirmVariant="danger"
        isLoading={isRefreshing}
        onCancel={() => setConfirmDeleteTransaction(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );

  if (!wrapInCard) {
    return content;
  }

  return <Card title={title}>{content}</Card>;
}
