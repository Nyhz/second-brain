import type { UnifiedTransactionRow } from '@second-brain/types';
import { formatMoney } from '../../../lib/format';
import { KpiCard } from '../../ui/kpi-card';
import { type TimelineFilterOption } from './transactions-shared';
import { TransactionsTimeline } from './transactions-timeline';

type TransactionsFeatureProps = {
  assetNameById: Record<string, string>;
  assetTypeFilter: string;
  assetTypeFilterOptions: TimelineFilterOption[];
  assetFilter: string;
  assetFilterOptions: TimelineFilterOption[];
  page: number;
  pageSize: number;
  rows: UnifiedTransactionRow[];
  totalPages: number;
  totalRows: number;
  totalTransactions: number;
  totalBuys: number;
  totalSells: number;
  typeFilter: string;
  typeFilterOptions: TimelineFilterOption[];
};

export function TransactionsFeature({
  assetNameById,
  assetTypeFilter,
  assetTypeFilterOptions,
  assetFilter,
  assetFilterOptions,
  page,
  pageSize,
  rows,
  totalPages,
  totalRows,
  totalTransactions,
  totalBuys,
  totalSells,
  typeFilter,
  typeFilterOptions,
}: TransactionsFeatureProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground">
            Review transaction history across all accounts.
          </p>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Buy Outflows"
          value={
            <span className="sb-sensitive-value">{formatMoney(totalBuys)}</span>
          }
        />
        <KpiCard
          label="Sell Inflows"
          value={
            <span className="sb-sensitive-value">
              {formatMoney(totalSells)}
            </span>
          }
        />
        <KpiCard label="Transactions" value={String(totalTransactions)} />
      </section>

      <TransactionsTimeline
        assetNameById={assetNameById}
        assetTypeFilter={assetTypeFilter}
        assetTypeFilterOptions={assetTypeFilterOptions}
        assetFilter={assetFilter}
        assetFilterOptions={assetFilterOptions}
        page={page}
        pageSize={pageSize}
        rows={rows}
        totalPages={totalPages}
        totalRows={totalRows}
        typeFilter={typeFilter}
        typeFilterOptions={typeFilterOptions}
      />
    </div>
  );
}
