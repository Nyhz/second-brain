import { TransactionsFeature } from '../../components/features/transactions/transactions-feature';
import {
  getRowTypeKey,
  getRowTypeLabel,
  type TimelineFilterOption,
} from '../../components/features/transactions/transactions-shared';
import { prettyAssetType } from '../../lib/display';
import {
  loadServerAccountsData,
  loadServerAssetsData,
  loadServerTransactionsData,
} from '../../lib/data/server-data';

const getSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const [accountsData, assetsData, transactionsData] = await Promise.all([
    loadServerAccountsData().catch(() => ({ rows: [] })),
    loadServerAssetsData().catch(() => ({ rows: [], holdingsByAssetId: {} })),
    loadServerTransactionsData().catch(() => ({ rows: [] })),
  ]);

  const typeFilter = getSingleSearchParam(resolvedSearchParams.type) ?? 'all';
  const assetFilter = getSingleSearchParam(resolvedSearchParams.asset) ?? 'all';
  const assetTypeFilter =
    getSingleSearchParam(resolvedSearchParams.assetType) ?? 'all';
  const pageSizeParam = Number(
    getSingleSearchParam(resolvedSearchParams.pageSize) ?? '25',
  );
  const pageParam = Number(
    getSingleSearchParam(resolvedSearchParams.page) ?? '1',
  );
  const pageSize = [10, 25, 50].includes(pageSizeParam) ? pageSizeParam : 25;

  const allRows = transactionsData.rows;
  const assetNameById = Object.fromEntries(
    assetsData.rows.map((asset) => [asset.id, asset.name]),
  );

  const typeFilterOptions: TimelineFilterOption[] = [
    { value: 'all', label: 'All Types' },
    ...Array.from(
      new Map(allRows.map((row) => [getRowTypeKey(row), getRowTypeLabel(row)])).entries(),
    )
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
  ];

  const assetFilterOptions: TimelineFilterOption[] = [
    { value: 'all', label: 'All Assets' },
    ...Array.from(
      new Map(
        allRows
          .filter((row) => row.assetId)
          .map((row) => [
            row.assetId as string,
            assetNameById[row.assetId as string] ??
              (row.assetLabel?.includes('·')
                ? row.assetLabel.split('·').at(-1)?.trim() ?? row.assetLabel
                : (row.assetLabel ?? '-')),
          ]),
      ).entries(),
    )
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
  ];

  const assetTypeFilterOptions: TimelineFilterOption[] = [
    { value: 'all', label: 'All Asset Types' },
    ...Array.from(
      new Map(
        allRows
          .filter((row) => row.assetType)
          .map((row) => [row.assetType as string, prettyAssetType(row.assetType)]),
      ).entries(),
    )
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
  ];

  const filteredRows = allRows.filter((row) => {
    const matchesType = typeFilter === 'all' || getRowTypeKey(row) === typeFilter;
    const matchesAsset = assetFilter === 'all' || row.assetId === assetFilter;
    const matchesAssetType =
      assetTypeFilter === 'all' || row.assetType === assetTypeFilter;
    return matchesType && matchesAsset && matchesAssetType;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Number.isFinite(pageParam)
    ? Math.min(Math.max(1, pageParam), totalPages)
    : 1;
  const start = (page - 1) * pageSize;
  const paginatedRows = filteredRows.slice(start, start + pageSize);

  const totalBuys = allRows
    .filter(
      (row) => row.rowKind === 'asset_transaction' && row.transactionType === 'buy',
    )
    .reduce((sum, row) => sum + Math.abs(row.cashImpactEur), 0);

  const totalSells = allRows
    .filter(
      (row) => row.rowKind === 'asset_transaction' && row.transactionType === 'sell',
    )
    .reduce((sum, row) => sum + row.cashImpactEur, 0);

  return (
    <TransactionsFeature
      accounts={accountsData.rows}
      assets={assetsData.rows}
      assetNameById={assetNameById}
      assetTypeFilter={assetTypeFilter}
      assetTypeFilterOptions={assetTypeFilterOptions}
      assetFilter={assetFilter}
      assetFilterOptions={assetFilterOptions}
      page={page}
      pageSize={pageSize}
      rows={paginatedRows}
      totalPages={totalPages}
      totalRows={filteredRows.length}
      totalTransactions={allRows.length}
      totalBuys={totalBuys}
      totalSells={totalSells}
      typeFilter={typeFilter}
      typeFilterOptions={typeFilterOptions}
    />
  );
}
