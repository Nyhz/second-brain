import type { Account } from '@second-brain/types';
import { tryApi } from './shared';

export const loadAccountsData = async () => {
  const rows = await tryApi<Account[]>('/finances/accounts');
  return {
    rows: rows ?? [],
  } as const;
};
