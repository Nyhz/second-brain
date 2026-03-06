import type { AssetWithPosition } from '@second-brain/types';
import { apiRequest } from '../api';

type AssetsWithHoldingsResponse = {
  rows: AssetWithPosition[];
  holdingsByAssetId: Record<string, number>;
};

type LoadAssetsDataOptions = {
  withHoldings?: boolean;
};

export const loadAssetsData = async (options?: LoadAssetsDataOptions) => {
  if (options?.withHoldings) {
    return apiRequest<AssetsWithHoldingsResponse>(
      '/finances/assets?includeHoldings=true',
    );
  }

  const rows = await apiRequest<AssetWithPosition[]>('/finances/assets');
  return {
    rows,
    holdingsByAssetId: {},
  } as const;
};
