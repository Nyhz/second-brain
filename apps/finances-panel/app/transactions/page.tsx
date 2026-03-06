import { TransactionsFeature } from '../../components/features/transactions/transactions-feature';
import { loadAccountsData } from '../../lib/data/accounts-data';
import { loadAssetsData } from '../../lib/data/assets-data';
import { loadTransactionsData } from '../../lib/data/transactions-data';

export default async function TransactionsPage() {
  const [accountsData, assetsData, transactionsData] = await Promise.all([
    loadAccountsData().catch(() => ({ rows: [] })),
    loadAssetsData().catch(() => ({ rows: [], holdingsByAssetId: {} })),
    loadTransactionsData().catch(() => ({ rows: [] })),
  ]);

  return (
    <TransactionsFeature
      initialAccounts={accountsData.rows}
      initialAssets={assetsData.rows}
      initialRows={transactionsData.rows}
    />
  );
}
