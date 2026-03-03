import type { Account } from '@second-brain/types';
import { tryApi } from './shared';

const fallbackAccounts: Account[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Main Checking',
    currency: 'USD',
    accountType: 'checking',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const loadAccountsData = async () => {
  const rows = await tryApi<Account[]>('/finances/accounts');
  return {
    rows: rows && rows.length > 0 ? rows : fallbackAccounts,
    source: rows ? 'api' : 'mock',
  } as const;
};
