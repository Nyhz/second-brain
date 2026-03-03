import type { Transaction } from '@second-brain/types';
import { tryApi } from './shared';

const fallbackTransactions: Transaction[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    accountId: '00000000-0000-4000-8000-000000000001',
    postedAt: new Date().toISOString(),
    amount: 5800,
    description: 'Payroll',
    category: 'income',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const loadTransactionsData = async () => {
  const rows = await tryApi<Transaction[]>('/finances/transactions');
  return {
    rows: rows && rows.length > 0 ? rows : fallbackTransactions,
    source: rows ? 'api' : 'mock',
  } as const;
};
