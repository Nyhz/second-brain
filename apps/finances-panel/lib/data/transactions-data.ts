import type { UnifiedTransactionRow } from '@second-brain/types';
import { apiRequest } from '../api';

export const loadTransactionsData = async () => {
  const rows = await apiRequest<UnifiedTransactionRow[]>('/finances/transactions');
  return {
    rows,
  } as const;
};
