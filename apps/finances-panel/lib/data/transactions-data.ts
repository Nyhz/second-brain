import type { UnifiedTransactionRow } from '@second-brain/types';
import { apiRequest } from '../api';

type LoadTransactionsDataOptions = {
  accountId?: string;
  limit?: number;
  cursor?: string;
};

export const loadTransactionsData = async (
  options?: LoadTransactionsDataOptions,
) => {
  const params = new URLSearchParams();
  if (options?.accountId) {
    params.set('accountId', options.accountId);
  }
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }

  const path =
    params.size === 0
      ? '/finances/transactions'
      : `/finances/transactions?${params.toString()}`;
  const rows = await apiRequest<UnifiedTransactionRow[]>(path);
  return {
    rows,
  } as const;
};
