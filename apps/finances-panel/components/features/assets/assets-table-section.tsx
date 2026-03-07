import type { AssetWithPosition } from '@second-brain/types';
import { Card } from '../../ui/card';
import { EmptyState } from '../../ui/states';
import { AssetsTable } from './assets-table';

export function AssetsTableSection({
  direction,
  holdingsByAssetId,
  rows,
  sort,
}: {
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
}) {
  return (
    <Card title="Asset Registry">
      {rows.length === 0 ? (
        <EmptyState message="No assets created yet." />
      ) : (
        <AssetsTable
          direction={direction}
          holdingsByAssetId={holdingsByAssetId}
          rows={rows}
          sort={sort}
        />
      )}
    </Card>
  );
}
