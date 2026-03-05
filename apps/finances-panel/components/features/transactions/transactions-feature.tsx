'use client';

import type {
  Account,
  AssetTransaction,
  AssetTransactionType,
  AssetType,
  AssetWithPosition,
  DegiroImportResult,
} from '@second-brain/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest } from '../../../lib/api';
import { loadAccountsData } from '../../../lib/data/accounts-data';
import { loadAssetsData } from '../../../lib/data/assets-data';
import { loadTransactionsData } from '../../../lib/data/transactions-data';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatDateTime, formatMoney } from '../../../lib/format';
import {
  type TransactionFormInput,
  validateTransactionForm,
} from '../../../lib/transactions';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  Modal,
} from '../../ui';

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
  dividendGross: '',
  dividendNet: '',
  notes: '',
});

type TaxSummary = {
  year: number;
  realizedGainLossEur: number;
};

const txTypes: AssetTransactionType[] = ['buy', 'sell', 'dividend'];
const v1AssetTypes: AssetType[] = [
  'stock',
  'etf',
  'mutual_fund',
  'retirement_fund',
  'crypto',
];

const formatAmountWithCurrency = (
  amount: number | null,
  currency: string,
): string => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '-';
  }
  return `${amount.toFixed(4)} ${currency}`;
};

const prettyAssetType = (assetType: AssetType) => {
  if (assetType === 'mutual_fund') return 'Investment Fund';
  if (assetType === 'retirement_fund') return 'Retirement Fund';
  if (assetType === 'etf') return 'ETF';
  if (assetType === 'stock') return 'Stock';
  if (assetType === 'crypto') return 'Crypto';
  return assetType;
};

export function TransactionsFeature() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<AssetWithPosition[]>([]);
  const [rows, setRows] = useState<AssetTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<
    string | null
  >(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isTaxLoading, setIsTaxLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getUTCFullYear());
  const [importAccountId, setImportAccountId] = useState('');
  const [importDryRun, setImportDryRun] = useState(true);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<DegiroImportResult | null>(
    null,
  );

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
      setImportAccountId((current) => current || defaultAccountId);
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
    if (form.transactionType === 'dividend') {
      const net = Number(form.dividendNet || '0');
      return toEur(net);
    }
    return 0;
  }, [form]);

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

  const deleteTransaction = async (transaction: AssetTransaction) => {
    if (
      !window.confirm(
        `Delete ${transaction.transactionType} transaction from ${formatDateTime(
          transaction.tradedAt,
        )}?`,
      )
    ) {
      return;
    }

    setDeletingTransactionId(transaction.id);
    try {
      await apiRequest(`/finances/asset-transactions/${transaction.id}`, {
        method: 'DELETE',
      });
      await Promise.all([load(), loadTaxSummary()]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const onImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setImportFile(next);
  };

  const importDegiroCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!importAccountId) {
      setErrorMessage('Select an account before importing.');
      return;
    }
    if (!importFile) {
      setErrorMessage('Select a CSV file to import.');
      return;
    }
    if (importFile.size > 5 * 1024 * 1024) {
      setErrorMessage('CSV file is larger than 5MB.');
      return;
    }

    setIsImporting(true);
    try {
      const csvText = await importFile.text();
      const result = await apiRequest<DegiroImportResult>(
        '/finances/import/degiro-transactions',
        {
          method: 'POST',
          body: JSON.stringify({
            accountId: importAccountId,
            fileName: importFile.name,
            csvText,
            dryRun: importDryRun,
          }),
        },
      );
      setImportResult(result);
      setErrorMessage(null);
      if (!importDryRun && result.importedRows > 0) {
        await Promise.all([load(), loadTaxSummary()]);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsImporting(false);
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

  const failedImportRows = importResult
    ? importResult.results.filter((row) => row.status === 'failed').slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground">
            Register buy, sell, and dividend operations by account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setIsImportModalOpen(true)}
          >
            Import CSV
          </Button>
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            Create Transaction
          </Button>
        </div>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Buy Outflows" value={formatMoney(totalBuys)} />
        <KpiCard label="Sell Inflows" value={formatMoney(totalSells)} />
        <KpiCard label="Fee Outflows" value={formatMoney(totalFees)} />
        <KpiCard label="Transactions" value={String(rows.length)} />
      </section>

      <Card title="Year-End Tax Summary">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="tax-year">
              Tax Year
            </label>
            <input
              id="tax-year"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="number"
              value={taxYear}
              onChange={(event) => setTaxYear(Number(event.target.value))}
              min={2000}
              max={2100}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {taxSummary ? (
              <>
                <p>Year: {taxSummary.year}</p>
                <p>
                  Realized Gain/Loss:{' '}
                  {formatMoney(taxSummary.realizedGainLossEur)}
                </p>
              </>
            ) : (
              <p>No summary loaded.</p>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadTaxSummary()}
            disabled={isTaxLoading}
          >
            {isTaxLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </Card>

      <Card title="Asset Transactions Table">
        {isLoading ? (
          <LoadingSkeleton lines={8} />
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
                render: (row: AssetTransaction) =>
                  prettyAssetType(row.assetType),
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
              {
                key: 'dividendGross',
                header: 'Gross Dividend',
                render: (row: AssetTransaction) =>
                  row.transactionType === 'dividend'
                    ? formatAmountWithCurrency(
                        row.dividendGross,
                        row.tradeCurrency,
                      )
                    : '-',
              },
              {
                key: 'withholdingTax',
                header: 'Retention',
                render: (row: AssetTransaction) =>
                  row.transactionType === 'dividend'
                    ? formatAmountWithCurrency(
                        row.withholdingTax,
                        row.tradeCurrency,
                      )
                    : '-',
              },
              {
                key: 'dividendNet',
                header: 'Net Dividend',
                render: (row: AssetTransaction) =>
                  row.transactionType === 'dividend'
                    ? formatAmountWithCurrency(
                        row.dividendNet,
                        row.tradeCurrency,
                      )
                    : '-',
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row: AssetTransaction) => (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={deletingTransactionId === row.id}
                    onClick={() => void deleteTransaction(row)}
                  >
                    {deletingTransactionId === row.id
                      ? 'Deleting...'
                      : 'Delete'}
                  </Button>
                ),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
          />
        )}
      </Card>

      <Modal
        open={isCreateModalOpen}
        title="Create Transaction"
        onClose={() => {
          if (!isSaving) {
            setIsCreateModalOpen(false);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={createTransaction}>
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="transaction-account"
            >
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
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({formatMoney(account.currentCashBalanceEur)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="transaction-type">
                Buy / Sell
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

          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="transaction-traded-at"
            >
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

          {form.transactionType !== 'dividend' ? (
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="transaction-quantity"
                >
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
                <label
                  className="text-sm font-medium"
                  htmlFor="transaction-unit-price"
                >
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
          ) : (
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
                {withholdingPreview === null
                  ? 'Enter gross/net values'
                  : formatMoney(withholdingPreview)}
              </p>
            </>
          )}

          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="transaction-currency"
              >
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
              <label
                className="text-sm font-medium"
                htmlFor="transaction-fx-rate"
              >
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
                Fees (EUR)
              </label>
              <input
                id="transaction-fees"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.feesAmount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    feesAmount: event.target.value,
                    feesCurrency: 'EUR',
                  }))
                }
              />
            </div>
          ) : null}

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

          <p className="text-xs text-muted-foreground">
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

      <Modal
        open={isImportModalOpen}
        title="Import DEGIRO Transactions CSV"
        onClose={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={importDegiroCsv}>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="import-account">
              Account
            </label>
            <select
              id="import-account"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={importAccountId}
              onChange={(event) => setImportAccountId(event.target.value)}
              required
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({formatMoney(account.currentCashBalanceEur)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="import-csv-file">
              CSV File
            </label>
            <input
              id="import-csv-file"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="file"
              accept=".csv,text/csv"
              onChange={onImportFileChange}
              required
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={importDryRun}
              onChange={(event) => setImportDryRun(event.target.checked)}
            />
            Dry run (validate without inserting transactions)
          </label>

          <Button
            type="submit"
            variant="primary"
            disabled={isImporting}
            fullWidth
          >
            {isImporting
              ? 'Importing...'
              : importDryRun
                ? 'Run Dry Import'
                : 'Import to DB'}
          </Button>
        </form>

        {importResult ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Source: DEGIRO · {importResult.dryRun ? 'Dry run' : 'Committed'} ·
              Rows {importResult.totalRows}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1">
                Imported: {importResult.importedRows}
              </span>
              <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1">
                Skipped: {importResult.skippedRows}
              </span>
              <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1">
                Failed: {importResult.failedRows}
              </span>
            </div>
            {failedImportRows.length > 0 ? (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  First failed rows:
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {failedImportRows.map((row) => (
                    <li key={`${row.rowNumber}-${row.reason ?? ''}`}>
                      Row {row.rowNumber}: {row.reason ?? 'Unknown failure'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
