import type {
  Account,
  AssetTransactionType,
  AssetType,
  BinanceImportResult,
  CobasImportResult,
  DegiroImportResult,
  UnifiedTransactionRow,
} from '@second-brain/types';
import type { TransactionFormInput } from '../../../lib/transactions';
import { formatMoney } from '../../../lib/format';
import { prettyAssetType, toLabel } from '../../../lib/display';

export type ImportSource = 'degiro' | 'binance' | 'cobas';
export type TransactionCreateMode = 'asset_transaction' | 'deposit';
export type TransactionsImportResult =
  | BinanceImportResult
  | DegiroImportResult
  | CobasImportResult;
export type TimelineFilterOption = {
  value: string;
  label: string;
};

export const txTypes: AssetTransactionType[] = ['buy', 'sell', 'fee', 'dividend'];
export const v1AssetTypes: AssetType[] = [
  'stock',
  'etf',
  'mutual_fund',
  'retirement_fund',
  'crypto',
];

export const initialForm = (accountId = ''): TransactionFormInput => ({
  accountId,
  assetType: 'stock',
  assetId: '',
  transactionType: 'buy',
  tradedAt: new Date().toISOString().slice(0, 16),
  quantity: '',
  unitPrice: '',
  tradeCurrency: 'EUR',
  fxRateToEur: '',
  feesAmount: '0',
  feesCurrency: 'EUR',
  dividendGross: '',
  dividendNet: '',
  notes: '',
});

export const prettyTxType = (row: UnifiedTransactionRow) => {
  if (row.rowKind === 'asset_transaction') {
    return toLabel(row.transactionType ?? 'Unknown');
  }
  return toLabel(row.movementType ?? 'Cash Movement');
};

export const isInvestmentAccount = (account: Account) =>
  account.accountType === 'brokerage' ||
  account.accountType === 'crypto_exchange' ||
  account.accountType === 'investment_platform' ||
  account.accountType === 'retirement_plan';

export const canCreateTransactionsForAccount = (account: Account) =>
  isInvestmentAccount(account) || account.accountType === 'savings';

export const getAllowedImportSourcesForAccount = (
  account: Account,
): ImportSource[] => {
  if (account.accountType === 'brokerage') {
    return ['degiro'];
  }
  if (account.accountType === 'crypto_exchange') {
    return ['binance'];
  }
  if (account.accountType === 'investment_platform') {
    return ['cobas'];
  }
  return [];
};

export const getRowTypeKey = (row: UnifiedTransactionRow) =>
  row.rowKind === 'asset_transaction'
    ? `tx:${row.transactionType ?? 'unknown'}`
    : `cash:${row.movementType ?? 'cash_movement'}`;

export const getRowTypeLabel = (row: UnifiedTransactionRow) => {
  if (row.rowKind === 'asset_transaction') {
    return toLabel(row.transactionType ?? 'Unknown');
  }
  return toLabel(row.movementType ?? 'Cash Movement');
};

export const getTransactionFeeLabel = (row: UnifiedTransactionRow) => {
  if (!row.feesAmountEur) {
    return '-';
  }
  return formatMoney(row.feesAmountEur);
};
