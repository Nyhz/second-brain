import type { AssetTransactionType, AssetType } from '@second-brain/types';

export type TransactionFormInput = {
  accountId: string;
  assetType: AssetType;
  assetId: string;
  transactionType: AssetTransactionType;
  tradedAt: string;
  quantity: string;
  unitPrice: string;
  tradeCurrency: string;
  fxRateToEur: string;
  feesAmount: string;
  feesCurrency: string;
  notes: string;
};

export type TransactionFormValidation =
  | {
      ok: true;
      normalized: {
        accountId: string;
        assetType: AssetType;
        assetId: string;
        transactionType: AssetTransactionType;
        tradedAt: string;
        quantity: number;
        unitPrice: number;
        tradeCurrency: string;
        fxRateToEur?: number | null;
        feesAmount: number;
        feesCurrency?: string | null;
        notes?: string | null;
      };
    }
  | { ok: false; message: string };

export const toInputDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return new Date().toISOString().slice(0, 16);
  }
  return date.toISOString().slice(0, 16);
};

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const validateTransactionForm = (
  input: TransactionFormInput,
): TransactionFormValidation => {
  if (!input.accountId) {
    return {
      ok: false,
      message: 'Select an account before creating a transaction.',
    };
  }

  if (!input.assetType || !input.assetId) {
    return {
      ok: false,
      message: 'Select an asset type and an asset.',
    };
  }

  const quantity = Number(input.quantity || '0');
  const unitPrice = Number(input.unitPrice || '0');
  const feesAmount = Number(input.feesAmount || '0');

  if (
    (input.transactionType === 'buy' || input.transactionType === 'sell') &&
    (!Number.isFinite(quantity) || quantity <= 0)
  ) {
    return { ok: false, message: 'Quantity must be greater than 0.' };
  }

  if (
    (input.transactionType === 'buy' || input.transactionType === 'sell') &&
    (!Number.isFinite(unitPrice) || unitPrice <= 0)
  ) {
    return { ok: false, message: 'Unit price must be greater than 0.' };
  }

  if (
    input.transactionType === 'fee' &&
    (!Number.isFinite(feesAmount) || feesAmount <= 0)
  ) {
    return { ok: false, message: 'Fee amount must be greater than 0.' };
  }
  if (input.transactionType === 'dividend') {
    return {
      ok: false,
      message: 'Dividend transactions are not supported in this app.',
    };
  }

  const tradeCurrency = input.tradeCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(tradeCurrency)) {
    return { ok: false, message: 'Trade currency must be a 3-letter code.' };
  }

  const fxRateToEur = parseOptionalNumber(input.fxRateToEur);
  if (tradeCurrency !== 'EUR' && (!fxRateToEur || fxRateToEur <= 0)) {
    return {
      ok: false,
      message: 'FX rate to EUR is required for non-EUR transactions.',
    };
  }

  const normalizedFeesCurrency = input.feesCurrency.trim().toUpperCase();
  if (normalizedFeesCurrency && !/^[A-Z]{3}$/.test(normalizedFeesCurrency)) {
    return { ok: false, message: 'Fee currency must be a 3-letter code.' };
  }

  return {
    ok: true,
    normalized: {
      accountId: input.accountId,
      assetType: input.assetType,
      assetId: input.assetId,
      transactionType: input.transactionType,
      tradedAt: input.tradedAt,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      tradeCurrency,
      fxRateToEur: fxRateToEur === undefined ? null : fxRateToEur,
      feesAmount: Number.isFinite(feesAmount) ? feesAmount : 0,
      feesCurrency: normalizedFeesCurrency || null,
      notes: input.notes.trim() ? input.notes.trim() : null,
    },
  };
};
