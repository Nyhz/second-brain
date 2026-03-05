import type { AssetWithPosition } from '@second-brain/types';
import { apiRequest } from '../api';

export const loadAssetsData = async () => {
  const rows = await apiRequest<AssetWithPosition[]>('/finances/assets');
  return { rows } as const;
};
