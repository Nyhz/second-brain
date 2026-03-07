import type { AssetWithPosition } from '@second-brain/types';
import { AssetsHeaderActions } from './assets-header-actions';
import { AssetsTableSection } from './assets-table-section';

type AssetsFeatureProps = {
  direction: 'asc' | 'desc';
  holdingsByAssetId: Record<string, number>;
  rows: AssetWithPosition[];
  sort:
    | 'asset'
    | 'currentValue'
    | 'isin'
    | 'quantity'
    | 'status'
    | 'symbol'
    | 'type'
    | 'unitPrice';
};

export function AssetsFeature({
  direction,
  holdingsByAssetId,
  rows,
  sort,
}: AssetsFeatureProps) {
  const activeCount = rows.filter((row) => row.isActive).length;
  const trackedCount = rows.filter((row) =>
    Boolean(row.providerSymbol ?? row.symbol ?? row.ticker),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">
            Manage tracked instruments and position metadata.
          </p>
        </div>
        <AssetsHeaderActions />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Total Assets
          </p>
          <p className="text-xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Active
          </p>
          <p className="text-xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Tracked
          </p>
          <p className="text-xl font-semibold">{trackedCount}</p>
        </div>
      </div>

      <AssetsTableSection
        direction={direction}
        holdingsByAssetId={holdingsByAssetId}
        rows={rows}
        sort={sort}
      />
    </div>
  );
}
