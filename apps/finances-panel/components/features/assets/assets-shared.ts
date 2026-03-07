import type { AssetType } from '@second-brain/types';

export const v1AssetTypeOptions: Array<{ value: AssetType; label: string }> = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutual_fund', label: 'Investment Fund' },
  { value: 'retirement_fund', label: 'Retirement Fund' },
  { value: 'crypto', label: 'Crypto' },
];

export type CreateAssetForm = {
  name: string;
  assetType: AssetType;
  symbol: string;
  providerSymbol: string;
  isin: string;
  currency: string;
};

export type MetadataForm = {
  assetId: string;
  name: string;
  assetType: AssetType;
  symbol: string;
  providerSymbol: string;
  isin: string;
  currency: string;
};

export const initialCreateForm: CreateAssetForm = {
  name: '',
  assetType: 'stock',
  symbol: '',
  providerSymbol: '',
  isin: '',
  currency: 'EUR',
};

export const initialMetadataForm: MetadataForm = {
  assetId: '',
  name: '',
  assetType: 'stock',
  symbol: '',
  providerSymbol: '',
  isin: '',
  currency: 'EUR',
};

export const deriveTicker = (symbol: string, isin: string) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol) {
    return normalizedSymbol.slice(0, 32);
  }
  const normalizedIsin = isin.trim().toUpperCase();
  if (normalizedIsin) {
    return normalizedIsin.slice(-8);
  }
  return 'ASSET';
};

export const requiresIsin = (assetType: AssetType) =>
  assetType === 'stock' ||
  assetType === 'etf' ||
  assetType === 'mutual_fund' ||
  assetType === 'retirement_fund';

export const requiresSymbol = (assetType: AssetType) =>
  assetType === 'stock' || assetType === 'etf' || assetType === 'crypto';
