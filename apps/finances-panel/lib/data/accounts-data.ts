import type { Account } from '@second-brain/types';
import { apiRequest } from '../api';

export const loadAccountsData = async () => {
  const rows = await apiRequest<Account[]>('/finances/accounts');
  return {
    rows,
  } as const;
};
