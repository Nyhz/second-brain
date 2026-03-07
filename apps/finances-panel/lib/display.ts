import type { AssetType } from '@second-brain/types';

export const toLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const prettyAssetType = (assetType: AssetType | null) => {
  if (assetType === 'mutual_fund') return 'Investment Fund';
  if (assetType === 'retirement_fund') return 'Retirement Fund';
  if (assetType === 'etf') return 'ETF';
  if (assetType === 'stock') return 'Stock';
  if (assetType === 'crypto') return 'Crypto';
  if (!assetType) return '-';
  return assetType;
};

export const accountTypeLabel = (accountType: string) => {
  if (accountType === 'brokerage') return 'Broker';
  if (accountType === 'crypto_exchange') return 'Exchange';
  if (accountType === 'investment_platform') return 'Investment Fund Account';
  if (accountType === 'retirement_plan') return 'Retirement Plan';
  if (accountType === 'savings') return 'Savings';
  return toLabel(accountType);
};
