'use client';

import type {
  Account,
  AssetTransaction,
  AssetTransactionType,
  AssetType,
  AssetWithPosition,
} from '@second-brain/types';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  KpiCard,
  Modal,
} from '../../components/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { loadAccountsData } from '../../lib/data/accounts-data';
import { loadAssetsData } from '../../lib/data/assets-data';
import { loadTransactionsData } from '../../lib/data/transactions-data';
import { getApiErrorMessage } from '../../lib/errors';
import { formatDateTime, formatMoney } from '../../lib/format';
import {
  type TransactionFormInput,
  validateTransactionForm,
} from '../../lib/transactions';

const initialForm = (accountId = ''): TransactionFormInput => ({
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
  notes: '',
});

type TaxSummary = {
  year: number;
  realizedGainLossEur: number;
};

const txTypes: AssetTransactionType[] = ['buy', 'sell', 'fee'];

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<AssetWithPosition[]>([]);
  const [rows, setRows] = useState<AssetTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTaxLoading, setIsTaxLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getUTCFullYear());

  const [form, setForm] = useState<TransactionFormInput>(initialForm());

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsData, assetsData, transactionsData] = await Promise.all([
        loadAccountsData(),
        loadAssetsData(),
        loadTransactionsData(),
      ]);

      setAccounts(accountsData.rows);
      setAssets(assetsData.rows);
      setRows(transactionsData.rows);

      const defaultAccountId = accountsData.rows[0]?.id ?? '';
      setForm((current) => ({
        ...current,
        accountId: current.accountId || defaultAccountId,
      }));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTaxSummary = useCallback(async () => {
    setIsTaxLoading(true);
    try {
      const data = await apiRequest<{
        year: number;
        realizedGainLossEur: number;
      }>(`/finances/tax/yearly-summary?year=${taxYear}`);
      setTaxSummary({
        year: data.year,
        realizedGainLossEur: data.realizedGainLossEur,
      });
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsTaxLoading(false);
    }
  }, [taxYear]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadTaxSummary();
  }, [loadTaxSummary]);

  const filteredAssets = useMemo(() => {
    return assets.filter(
      (asset) => asset.assetType === form.assetType && asset.isActive,
    );
  }, [assets, form.assetType]);

  useEffect(() => {
    if (!filteredAssets.find((asset) => asset.id === form.assetId)) {
      setForm((current) => ({
        ...current,
        assetId: filteredAssets[0]?.id ?? '',
      }));
    }
  }, [filteredAssets, form.assetId]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.accountId) ?? null,
    [accounts, form.accountId],
  );

  const cashImpactPreview = useMemo(() => {
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
    return 0;
  }, [form]);

  const createTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateTransactionForm(form);
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest('/finances/asset-transactions', {
        method: 'POST',
        body: JSON.stringify(validation.normalized),
      });
      setForm(initialForm(validation.normalized.accountId));
      setIsCreateModalOpen(false);
      await Promise.all([load(), loadTaxSummary()]);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const totalBuys = useMemo(() => {
    return rows
      .filter((row) => row.transactionType === 'buy')
      .reduce((sum, row) => sum + Math.abs(row.cashImpactEur), 0);
  }, [rows]);

  const totalSells = useMemo(() => {
    return rows
      .filter((row) => row.transactionType === 'sell')
      .reduce((sum, row) => sum + row.cashImpactEur, 0);
  }, [rows]);

  const totalFees = useMemo(() => {
    return rows
      .filter((row) => row.transactionType === 'fee')
      .reduce((sum, row) => sum + Math.abs(row.cashImpactEur), 0);
  }, [rows]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Investment Transactions</h1>
          <p className="small">
            Register buys, sells, and fees with source-account cash control.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Transaction
        </Button>
      </header>

      {errorMessage ? (
        <p className="small" style={{ color: '#f87171' }}>
          {errorMessage}
        </p>
      ) : null}

      <section className="sb-grid-kpi">
        <KpiCard label="Buy Outflows" value={formatMoney(totalBuys)} />
        <KpiCard label="Sell Inflows" value={formatMoney(totalSells)} />
        <KpiCard label="Fee Outflows" value={formatMoney(totalFees)} />
      </section>

      <div className="section-stack">
        <Card title="Year-End Tax Summary">
          <div className="form-grid">
            <input
              type="number"
              value={taxYear}
              onChange={(event) => setTaxYear(Number(event.target.value))}
              min={2000}
              max={2100}
            />
            <button
              type="button"
              onClick={() => void loadTaxSummary()}
              disabled={isTaxLoading}
            >
              {isTaxLoading ? 'Loading...' : 'Refresh Summary'}
            </button>
            {taxSummary ? (
              <>
                <p className="small">Year: {taxSummary.year}</p>
                <p className="small">
                  Realized Gain/Loss:{' '}
                  {formatMoney(taxSummary.realizedGainLossEur)}
                </p>
              </>
            ) : (
              <p className="small">No summary loaded.</p>
            )}
          </div>
        </Card>
      </div>

      <Card title="Asset Transactions Table">
        {isLoading ? (
          <p className="small">Loading transactions...</p>
        ) : rows.length === 0 ? (
          <EmptyState message="No transactions yet." />
        ) : (
          <DataTable
            columns={[
              {
                key: 'tradedAt',
                header: 'Date',
                render: (row: AssetTransaction) => formatDateTime(row.tradedAt),
              },
              {
                key: 'type',
                header: 'Type',
                render: (row: AssetTransaction) => row.transactionType,
              },
              {
                key: 'asset',
                header: 'Asset Type',
                render: (row: AssetTransaction) => row.assetType,
              },
              {
                key: 'qty',
                header: 'Qty',
                render: (row: AssetTransaction) => row.quantity.toString(),
              },
              {
                key: 'price',
                header: 'Unit Price',
                render: (row: AssetTransaction) =>
                  `${row.unitPrice.toFixed(4)} ${row.tradeCurrency}`,
              },
              {
                key: 'cash',
                header: 'Cash Impact EUR',
                render: (row: AssetTransaction) =>
                  formatMoney(row.cashImpactEur),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
          />
        )}
      </Card>

      <Modal
        open={isCreateModalOpen}
        title="Create Investment Transaction"
        onClose={() => {
          if (!isSaving) {
            setIsCreateModalOpen(false);
          }
        }}
      >
        <form className="form-grid" onSubmit={createTransaction}>
          <select
            value={form.accountId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                accountId: event.target.value,
              }))
            }
            required
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({formatMoney(account.currentCashBalanceEur)})
              </option>
            ))}
          </select>
          <select
            value={form.assetType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                assetType: event.target.value as AssetType,
                assetId: '',
              }))
            }
          >
            {[
              'stock',
              'etf',
              'mutual_fund',
              'retirement_fund',
              'real_estate',
              'bond',
              'crypto',
              'cash_equivalent',
              'other',
            ].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
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
          <select
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
                {type}
              </option>
            ))}
          </select>
          <input
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
          <input
            value={form.quantity}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                quantity: event.target.value,
              }))
            }
            placeholder="Quantity"
          />
          <input
            value={form.unitPrice}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                unitPrice: event.target.value,
              }))
            }
            placeholder="Unit price"
          />
          <input
            value={form.tradeCurrency}
            maxLength={3}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tradeCurrency: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Trade currency"
            required
          />
          <input
            value={form.fxRateToEur}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                fxRateToEur: event.target.value,
              }))
            }
            placeholder="FX to EUR (if needed)"
          />
          <input
            value={form.feesAmount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                feesAmount: event.target.value,
              }))
            }
            placeholder="Fees amount"
          />
          <input
            value={form.feesCurrency}
            maxLength={3}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                feesCurrency: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Fees currency"
          />
          <input
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Notes"
          />
          <p className="small">
            Cash impact preview:{' '}
            {Number.isFinite(cashImpactPreview)
              ? formatMoney(cashImpactPreview)
              : 'requires FX'}
            {selectedAccount
              ? ` · Account cash: ${formatMoney(selectedAccount.currentCashBalanceEur)}`
              : ''}
          </p>
          <Button type="submit" variant="primary" disabled={isSaving} fullWidth>
            {isSaving ? 'Saving...' : 'Create Transaction'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
