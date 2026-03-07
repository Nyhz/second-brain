import { AssetsFeature } from '../../components/features/assets/assets-feature';
import { prettyAssetType } from '../../lib/display';
import { loadServerAssetsData } from '../../lib/data/server-data';

const getSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

type AssetRow = Awaited<ReturnType<typeof loadServerAssetsData>>['rows'][number];
type AssetSortKey =
  | 'asset'
  | 'currentValue'
  | 'isin'
  | 'quantity'
  | 'status'
  | 'symbol'
  | 'type'
  | 'unitPrice';

const assetComparators = {
  asset: (row: AssetRow) => row.name,
  currentValue: (row: AssetRow) => row.currentValue ?? Number.NEGATIVE_INFINITY,
  isin: (row: AssetRow) => row.isin ?? '',
  quantity: (row: AssetRow, holdingsByAssetId: Record<string, number>) =>
    holdingsByAssetId[row.id] ?? 0,
  status: (row: AssetRow) => (row.isActive ? 'active' : 'inactive'),
  symbol: (row: AssetRow) => row.symbol ?? '',
  type: (row: AssetRow) => prettyAssetType(row.assetType),
  unitPrice: (row: AssetRow) => row.resolvedUnitPrice ?? Number.NEGATIVE_INFINITY,
} as const;

export default async function AssetsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const assetsData = await loadServerAssetsData(true).catch(() => ({
    rows: [],
    holdingsByAssetId: {},
  }));
  const sortParam = getSingleSearchParam(resolvedSearchParams.sort);
  const directionParam = getSingleSearchParam(resolvedSearchParams.direction);
  const sort =
    sortParam && sortParam in assetComparators
      ? (sortParam as AssetSortKey)
      : 'currentValue';
  const direction = directionParam === 'asc' ? 'asc' : 'desc';
  const sortedRows = [...assetsData.rows].sort((left, right) => {
    const leftValue =
      sort === 'quantity'
        ? assetComparators.quantity(left, assetsData.holdingsByAssetId)
        : assetComparators[sort](left);
    const rightValue =
      sort === 'quantity'
        ? assetComparators.quantity(right, assetsData.holdingsByAssetId)
        : assetComparators[sort](right);
    const result =
      typeof leftValue === 'string' || typeof rightValue === 'string'
        ? String(leftValue).localeCompare(String(rightValue), undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        : Number(leftValue) - Number(rightValue);
    return direction === 'asc' ? result : -result;
  });

  return (
    <AssetsFeature
      direction={direction}
      holdingsByAssetId={assetsData.holdingsByAssetId}
      rows={sortedRows}
      sort={sort}
    />
  );
}
