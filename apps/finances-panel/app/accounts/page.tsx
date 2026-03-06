import { AccountsFeature } from '../../components/features/accounts/accounts-feature';
import { loadAccountsData } from '../../lib/data/accounts-data';

export default async function AccountsPage() {
  const accountsData = await loadAccountsData().catch(() => ({ rows: [] }));
  return <AccountsFeature initialRows={accountsData.rows} />;
}
