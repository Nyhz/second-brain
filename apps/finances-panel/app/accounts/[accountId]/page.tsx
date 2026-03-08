import { notFound, redirect } from 'next/navigation';
import { AccountProfileFeature } from '../../../components/features/accounts/account-profile-feature';
import { clampPage, resolvePageSize } from '../../../lib/pagination';
import {
  getAccountSlugById,
  resolveAccountIdFromPathSegment,
} from '../../../lib/account-slugs';
import {
  loadServerAccountsData,
  loadServerAssetsData,
  loadServerOverview,
  loadServerTransactionsData,
} from '../../../lib/data/server-data';

export default async function AccountProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accountPathSegment = decodeURIComponent((await params).accountId);
  const resolvedSearchParams = (await searchParams) ?? {};
  const accountsData = await loadServerAccountsData();
  const accountId = resolveAccountIdFromPathSegment(
    accountPathSegment,
    accountsData.rows,
  );

  if (!accountId) {
    notFound();
  }

  const canonicalSlug = getAccountSlugById(accountId, accountsData.rows);
  if (canonicalSlug && canonicalSlug !== accountPathSegment) {
    redirect(`/accounts/${encodeURIComponent(canonicalSlug)}`);
  }

  const [initialData, transactionsData, assetsData] = await Promise.all([
    loadServerOverview('1M', accountId).catch(() => undefined),
    loadServerTransactionsData(accountId).catch(() => ({ rows: [] })),
    loadServerAssetsData().catch(() => ({ rows: [], holdingsByAssetId: {} })),
  ]);
  const pageSize = resolvePageSize(
    Array.isArray(resolvedSearchParams.txPageSize)
      ? resolvedSearchParams.txPageSize[0]
      : resolvedSearchParams.txPageSize,
    [10, 25, 50],
    10,
  );
  const totalRows = transactionsData.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clampPage(
    Array.isArray(resolvedSearchParams.txPage)
      ? resolvedSearchParams.txPage[0]
      : resolvedSearchParams.txPage,
    totalPages,
  );
  const start = (page - 1) * pageSize;
  const paginatedRows = transactionsData.rows.slice(start, start + pageSize);

  if (initialData) {
    return (
      <AccountProfileFeature
        accountId={accountId}
        accounts={accountsData.rows}
        assets={assetsData.rows}
        initialData={initialData}
        initialTransactions={paginatedRows}
        transactionsPage={page}
        transactionsPageSize={pageSize}
        transactionsTotalPages={totalPages}
        transactionsTotalRows={totalRows}
      />
    );
  }

  return (
    <AccountProfileFeature
      accountId={accountId}
      accounts={accountsData.rows}
      assets={assetsData.rows}
      initialTransactions={paginatedRows}
      transactionsPage={page}
      transactionsPageSize={pageSize}
      transactionsTotalPages={totalPages}
      transactionsTotalRows={totalRows}
    />
  );
}
