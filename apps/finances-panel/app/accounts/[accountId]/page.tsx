import { notFound, redirect } from 'next/navigation';
import { AccountProfileFeature } from '../../../components/features/accounts/account-profile-feature';
import {
  getAccountSlugById,
  resolveAccountIdFromPathSegment,
} from '../../../lib/account-slugs';
import { loadAccountsData } from '../../../lib/data/accounts-data';
import { loadOverview } from '../../../lib/data/overview-data';

export default async function AccountProfilePage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const accountPathSegment = decodeURIComponent((await params).accountId);
  const accountsData = await loadAccountsData();
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

  const initialData = await loadOverview('1M', accountId).catch(
    () => undefined,
  );
  if (initialData) {
    return (
      <AccountProfileFeature accountId={accountId} initialData={initialData} />
    );
  }

  return <AccountProfileFeature accountId={accountId} />;
}
