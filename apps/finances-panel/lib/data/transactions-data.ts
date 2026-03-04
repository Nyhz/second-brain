import type { AssetTransaction } from '@second-brain/types';
import { tryApi } from './shared';

export const loadTransactionsData = async () => {
  const rows = await tryApi<AssetTransaction[]>('/finances/asset-transactions');
  return {
    rows: rows ?? [],
  } as const;
};
