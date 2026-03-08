'use client';

import type {
  Account,
  AssetTransactionType,
  AssetType,
  AssetWithPosition,
} from '@second-brain/types';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { prettyAssetType } from '../../../lib/display';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatMoney } from '../../../lib/format';
import {
  type TransactionFormInput,
  validateTransactionForm,
} from '../../../lib/transactions';
import { Button } from '../../ui/button';
import { Modal } from '../../ui/modal';
import {
  initialForm,
  isInvestmentAccount,
  type TransactionCreateMode,
  txTypes,
  v1AssetTypes,
} from './transactions-shared';

export function TransactionsCreateModal({
  accounts,
  assets,
  defaultAccountId,
  lockAccountId = false,
  onClose,
  onCreated,
  onError,
  open,
}: {
  accounts: Account[];
  assets: AssetWithPosition[];
  defaultAccountId?: string;
  lockAccountId?: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
  open: boolean;
}) {
  const defaultAccount = useMemo(
    () => accounts.find((account) => account.id === defaultAccountId) ?? null,
    [accounts, defaultAccountId],
  );
  const defaultCreateMode: TransactionCreateMode =
    defaultAccount?.accountType === 'savings' ? 'deposit' : 'asset_transaction';
  const [isSaving, setIsSaving] = useState(false);
  const [createMode, setCreateMode] =
    useState<TransactionCreateMode>(defaultCreateMode);
  const [depositAmount, setDepositAmount] = useState('0');
  const [form, setForm] = useState<TransactionFormInput>(
    initialForm(defaultAccountId ?? ''),
  );

  const investmentAccounts = useMemo(
    () => accounts.filter(isInvestmentAccount),
    [accounts],
  );
  const savingsAccounts = useMemo(
    () => accounts.filter((account) => account.accountType === 'savings'),
    [accounts],
  );
  const createAccounts = useMemo(
    () => {
      const available =
        createMode === 'deposit' ? savingsAccounts : investmentAccounts;
      if (!defaultAccountId) {
        return available;
      }
      return available.filter((account) => account.id === defaultAccountId);
    },
    [createMode, defaultAccountId, investmentAccounts, savingsAccounts],
  );
  const filteredAssets = useMemo(
    () =>
      assets.filter(
        (asset) => asset.assetType === form.assetType && asset.isActive,
      ),
    [assets, form.assetType],
  );

  useEffect(() => {
    if (!defaultAccount) {
      return;
    }
    setCreateMode(defaultCreateMode);
    setForm((current) => ({
      ...current,
      accountId: defaultAccount.id,
    }));
  }, [defaultAccount, defaultCreateMode]);

  useEffect(() => {
    const defaultCreateAccountId = createAccounts[0]?.id ?? '';
    if (!createAccounts.some((account) => account.id === form.accountId)) {
      setForm((current) => ({
        ...current,
        accountId: defaultCreateAccountId,
      }));
    }
  }, [createAccounts, form.accountId]);

  useEffect(() => {
    if (!filteredAssets.find((asset) => asset.id === form.assetId)) {
      setForm((current) => ({
        ...current,
        assetId: filteredAssets[0]?.id ?? '',
      }));
    }
  }, [filteredAssets, form.assetId]);

  const cashImpactPreview = useMemo(() => {
    if (createMode === 'deposit') {
      const amount = Number(depositAmount || '0');
      return Number.isFinite(amount) ? amount : Number.NaN;
    }

    const quantity = Number(form.quantity || '0');
    const unitPrice = Number(form.unitPrice || '0');
    const feesAmount = Number(form.feesAmount || '0');
    const fxRate = Number(form.fxRateToEur || '0');
    const currency = form.tradeCurrency.trim().toUpperCase();

    const toEur = (value: number) => {
      if (currency === 'EUR') {
        return value;
      }
      if (!Number.isFinite(fxRate) || fxRate <= 0) {
        return Number.NaN;
      }
      return value * fxRate;
    };

    if (form.transactionType === 'buy') {
      return -(toEur(quantity * unitPrice) + toEur(feesAmount));
    }
    if (form.transactionType === 'sell') {
      return toEur(quantity * unitPrice) - toEur(feesAmount);
    }
    if (form.transactionType === 'fee') {
      return -toEur(feesAmount);
    }
    if (form.transactionType === 'dividend') {
      return toEur(Number(form.dividendNet || '0'));
    }
    return 0;
  }, [createMode, depositAmount, form]);

  const grossTradePreview = useMemo(() => {
    if (createMode !== 'asset_transaction') {
      return Number.NaN;
    }
    const quantity = Number(form.quantity || '0');
    const unitPrice = Number(form.unitPrice || '0');
    const value = quantity * unitPrice;
    return Number.isFinite(value) ? value : Number.NaN;
  }, [createMode, form.quantity, form.unitPrice]);

  const feePreview = useMemo(() => {
    const value = Number(form.feesAmount || '0');
    return Number.isFinite(value) ? value : Number.NaN;
  }, [form.feesAmount]);

  const withholdingPreview = useMemo(() => {
    const gross = Number(form.dividendGross || '0');
    const net = Number(form.dividendNet || '0');
    if (!Number.isFinite(gross) || !Number.isFinite(net)) {
      return null;
    }
    if (gross <= 0 || net < 0 || net > gross) {
      return null;
    }
    return Number((gross - net).toFixed(6));
  }, [form.dividendGross, form.dividendNet]);

  const createTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSaving(true);
    try {
      if (createMode === 'deposit') {
        if (!form.accountId) {
          onError('Select a savings account before creating a deposit.');
          return;
        }
        const amount = Number(depositAmount || '0');
        if (!Number.isFinite(amount) || amount <= 0) {
          onError('Deposit amount must be greater than 0.');
          return;
        }

        await apiRequest('/finances/account-cash-movements', {
          method: 'POST',
          body: JSON.stringify({
            accountId: form.accountId,
            movementType: 'deposit',
            occurredAt: new Date(form.tradedAt).toISOString(),
            nativeAmount: amount,
            currency: 'EUR',
            notes: form.notes.trim() || null,
          }),
        });
        setDepositAmount('0');
        setForm(initialForm(form.accountId));
      } else {
        const validation = validateTransactionForm(form);
        if (!validation.ok) {
          onError(validation.message);
          return;
        }

        await apiRequest('/finances/asset-transactions', {
          method: 'POST',
          body: JSON.stringify(validation.normalized),
        });
        setForm(initialForm(validation.normalized.accountId));
      }

      onError('');
      await onCreated();
      onClose();
    } catch (error) {
      onError(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Create Transaction"
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
    >
      <form className="grid gap-4" onSubmit={createTransaction}>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="transaction-create-mode">
            Entry Type
          </label>
          <select
            id="transaction-create-mode"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={createMode}
            onChange={(event) =>
              setCreateMode(event.target.value as TransactionCreateMode)
            }
            disabled={lockAccountId && Boolean(defaultAccount)}
          >
            {defaultAccount?.accountType === 'savings' ? (
              <option value="deposit">Savings Deposit</option>
            ) : (
              <option value="asset_transaction">Asset Transaction</option>
            )}
            {!lockAccountId || !defaultAccount ? (
              <option value="deposit">Savings Deposit</option>
            ) : null}
          </select>
        </div>

        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="transaction-account">
            Account
          </label>
          <select
            id="transaction-account"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.accountId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                accountId: event.target.value,
              }))
            }
            required
            disabled={lockAccountId}
          >
            <option value="">
              {createMode === 'deposit'
                ? 'Select savings account'
                : 'Select investment account'}
            </option>
            {createAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {createMode === 'asset_transaction' ? (
          <>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="transaction-type">
                  Transaction Type
                </label>
                <select
                  id="transaction-type"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.transactionType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      transactionType: event.target.value as AssetTransactionType,
                    }))
                  }
                >
                  {txTypes.map((type) => (
                    <option key={type} value={type}>
                      {type === 'buy'
                        ? 'Buy'
                        : type === 'sell'
                          ? 'Sell'
                          : type === 'fee'
                            ? 'Fee'
                            : 'Dividend'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="transaction-asset-type"
                >
                  Type of Asset
                </label>
                <select
                  id="transaction-asset-type"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.assetType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assetType: event.target.value as AssetType,
                      assetId: '',
                    }))
                  }
                >
                  {v1AssetTypes.map((type) => (
                    <option key={type} value={type}>
                      {prettyAssetType(type)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="transaction-asset">
                Asset
              </label>
              <select
                id="transaction-asset"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.assetId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assetId: event.target.value,
                  }))
                }
                required
              >
                <option value="">Select asset</option>
                {filteredAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.ticker} · {asset.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="transaction-traded-at">
            Date / Time
          </label>
          <input
            id="transaction-traded-at"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            type="datetime-local"
            value={form.tradedAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tradedAt: event.target.value,
              }))
            }
            required
          />
        </div>

        {createMode === 'deposit' ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="transaction-deposit">
              Deposit Amount (EUR)
            </label>
            <input
              id="transaction-deposit"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="number"
              step="0.01"
              min="0.01"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              required
            />
          </div>
        ) : null}

        {createMode === 'asset_transaction' &&
        (form.transactionType === 'buy' || form.transactionType === 'sell') ? (
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="transaction-quantity">
                Quantity
              </label>
              <input
                id="transaction-quantity"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.quantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="transaction-unit-price">
                Unit Price
              </label>
              <input
                id="transaction-unit-price"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.unitPrice}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    unitPrice: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        ) : null}

        {createMode === 'asset_transaction' && form.transactionType === 'dividend' ? (
          <>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="transaction-dividend-gross"
                >
                  Gross Dividend
                </label>
                <input
                  id="transaction-dividend-gross"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.dividendGross}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dividendGross: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="transaction-dividend-net"
                >
                  Net Dividend
                </label>
                <input
                  id="transaction-dividend-net"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.dividendNet}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dividendNet: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Retention (auto):{' '}
              {withholdingPreview === null ? (
                'Enter gross/net values'
              ) : (
                <span className="sb-sensitive-value">
                  {formatMoney(withholdingPreview)}
                </span>
              )}
            </p>
          </>
        ) : null}

        {createMode === 'asset_transaction' ? (
          <>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="transaction-currency">
                  Currency
                </label>
                <select
                  id="transaction-currency"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.tradeCurrency}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tradeCurrency: event.target.value,
                      feesCurrency: event.target.value,
                      fxRateToEur:
                        event.target.value === 'EUR' ? '' : current.fxRateToEur,
                    }))
                  }
                  required
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="transaction-fx-rate">
                  FX Rate (to EUR)
                </label>
                <input
                  id="transaction-fx-rate"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.fxRateToEur}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fxRateToEur: event.target.value,
                    }))
                  }
                  disabled={form.tradeCurrency === 'EUR'}
                  required={form.tradeCurrency !== 'EUR'}
                />
              </div>
            </div>

            {form.transactionType !== 'dividend' ? (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="transaction-fees">
                  Fees ({form.tradeCurrency})
                </label>
                <input
                  id="transaction-fees"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.feesAmount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      feesAmount: event.target.value,
                      feesCurrency: current.tradeCurrency,
                    }))
                  }
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="transaction-deposit-currency"
            >
              Currency
            </label>
            <input
              id="transaction-deposit-currency"
              className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              value="EUR"
              disabled
            />
          </div>
        )}

        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="transaction-notes">
            Notes
          </label>
          <input
            id="transaction-notes"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {createMode === 'asset_transaction' &&
          form.transactionType !== 'dividend' ? (
            <>
              <p>
                Gross trade amount ({form.tradeCurrency}):{' '}
                {Number.isFinite(grossTradePreview)
                  ? grossTradePreview.toFixed(6)
                  : 'invalid'}
              </p>
              <p>
                Fees ({form.tradeCurrency}):{' '}
                {Number.isFinite(feePreview) ? feePreview.toFixed(6) : 'invalid'}
              </p>
            </>
          ) : null}
          <p>
            Net EUR cash impact:{' '}
            {Number.isFinite(cashImpactPreview) ? (
              <span className="sb-sensitive-value">
                {formatMoney(cashImpactPreview)}
              </span>
            ) : createMode === 'deposit' ? (
              'invalid amount'
            ) : (
              'requires FX'
            )}
          </p>
        </div>

        <Button type="submit" variant="primary" disabled={isSaving} fullWidth>
          {isSaving
            ? 'Saving...'
            : createMode === 'deposit'
              ? 'Create Deposit'
              : 'Create Transaction'}
        </Button>
      </form>
    </Modal>
  );
}
