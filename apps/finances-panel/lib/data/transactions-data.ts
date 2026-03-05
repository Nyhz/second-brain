import type { AssetTransaction } from '@second-brain/types';
import { apiRequest } from '../api';

export const loadTransactionsData = async () => {
  const rows = await apiRequest<AssetTransaction[]>(
    '/finances/asset-transactions',
  );
  return {
    rows,
  } as const;
};
