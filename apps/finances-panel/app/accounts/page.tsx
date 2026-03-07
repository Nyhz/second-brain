import { AccountsFeature } from '../../components/features/accounts/accounts-feature';
import { accountTypeLabel } from '../../lib/display';
import { loadServerAccountsData } from '../../lib/data/server-data';

const getSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

type AccountRow = Awaited<ReturnType<typeof loadServerAccountsData>>['rows'][number];

const accountComparators = {
  cash: (row: AccountRow) =>
    row.accountType === 'savings'
      ? row.currentCashBalanceEur
      : Number.NEGATIVE_INFINITY,
  created: (row: AccountRow) => new Date(row.createdAt).getTime(),
  currency: (row: AccountRow) => row.currency,
  name: (row: AccountRow) => row.name,
  type: (row: AccountRow) => accountTypeLabel(row.accountType),
} as const;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const accountsData = await loadServerAccountsData().catch(() => ({
    rows: [],
  }));
  const sortParam = getSingleSearchParam(resolvedSearchParams.sort);
  const directionParam = getSingleSearchParam(resolvedSearchParams.direction);
  const sort =
    sortParam && sortParam in accountComparators
      ? (sortParam as keyof typeof accountComparators)
      : 'created';
  const direction = directionParam === 'asc' ? 'asc' : 'desc';
  const sortedRows = [...accountsData.rows].sort((left, right) => {
    const leftValue = accountComparators[sort](left);
    const rightValue = accountComparators[sort](right);
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
    <AccountsFeature direction={direction} rows={sortedRows} sort={sort} />
  );
}
