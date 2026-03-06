'use client';

import type {
  Account,
  AssetTransactionType,
  AssetType,
  AssetWithPosition,
  BinanceImportResult,
  CobasImportResult,
  DegiroImportResult,
  UnifiedTransactionRow,
} from '@second-brain/types';
import { useRouter } from 'next/navigation';
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
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ConfirmModal } from '../../ui/confirm-modal';
import { DataTable } from '../../ui/data-table';
import { KpiCard } from '../../ui/kpi-card';
import { Modal } from '../../ui/modal';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../ui/states';

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

type ImportSource = 'degiro' | 'binance' | 'cobas';
type TransactionCreateMode = 'asset_transaction' | 'deposit';

type TransactionsImportResult =
  | BinanceImportResult
  | DegiroImportResult
  | CobasImportResult;
type TimelineFilterOption = {
  value: string;
  label: string;
};

const txTypes: AssetTransactionType[] = ['buy', 'sell', 'fee', 'dividend'];
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

const prettyAssetType = (assetType: AssetType | null) => {
  if (assetType === 'mutual_fund') return 'Investment Fund';
  if (assetType === 'retirement_fund') return 'Retirement Fund';
  if (assetType === 'etf') return 'ETF';
  if (assetType === 'stock') return 'Stock';
  if (assetType === 'crypto') return 'Crypto';
  if (!assetType) return '-';
  return assetType;
};

const prettyTxType = (row: UnifiedTransactionRow) => {
  if (row.rowKind === 'asset_transaction') {
    return toLabel(row.transactionType ?? 'Unknown');
  }
  return toLabel(row.movementType ?? 'Cash Movement');
};

const isInvestmentAccount = (accountType: string) =>
  accountType === 'brokerage' ||
  accountType === 'crypto_exchange' ||
  accountType === 'investment_platform' ||
  accountType === 'retirement_plan';

const toLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const getRowTypeKey = (row: UnifiedTransactionRow) =>
  row.rowKind === 'asset_transaction'
    ? `tx:${row.transactionType ?? 'unknown'}`
    : `cash:${row.movementType ?? 'cash_movement'}`;

const getRowTypeLabel = (row: UnifiedTransactionRow) => {
  if (row.rowKind === 'asset_transaction') {
    return toLabel(row.transactionType ?? 'Unknown');
  }
  return toLabel(row.movementType ?? 'Cash Movement');
};

type TransactionsFeatureProps = {
  initialAccounts?: Account[];
  initialAssets?: AssetWithPosition[];
  initialRows?: UnifiedTransactionRow[];
};

export function TransactionsFeature({
  initialAccounts,
  initialAssets,
  initialRows,
}: TransactionsFeatureProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts ?? []);
  const [assets, setAssets] = useState<AssetWithPosition[]>(
    initialAssets ?? [],
  );
  const [rows, setRows] = useState<UnifiedTransactionRow[]>(initialRows ?? []);
  const [isLoading, setIsLoading] = useState(
    initialAccounts === undefined ||
      initialAssets === undefined ||
      initialRows === undefined,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<
    string | null
  >(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDeleteTransaction, setConfirmDeleteTransaction] =
    useState<UnifiedTransactionRow | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [assetFilter, setAssetFilter] = useState('all');
  const [assetTypeFilter, setAssetTypeFilter] = useState('all');
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(25);

  const [createMode, setCreateMode] =
    useState<TransactionCreateMode>('asset_transaction');
  const [depositAmount, setDepositAmount] = useState('0');

  const [importSource, setImportSource] = useState<ImportSource>('degiro');
  const [importAccountId, setImportAccountId] = useState('');
  const [importDryRun, setImportDryRun] = useState(true);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] =
    useState<TransactionsImportResult | null>(null);

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
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const investmentAccounts = useMemo(
    () =>
      accounts.filter((account) => isInvestmentAccount(account.accountType)),
    [accounts],
  );
  const brokerageAccounts = useMemo(
    () => accounts.filter((account) => account.accountType === 'brokerage'),
    [accounts],
  );
  const exchangeAccounts = useMemo(
    () =>
      accounts.filter((account) => account.accountType === 'crypto_exchange'),
    [accounts],
  );
  const investmentFundAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.accountType === 'investment_platform',
      ),
    [accounts],
  );
  const savingsAccounts = useMemo(
    () => accounts.filter((account) => account.accountType === 'savings'),
    [accounts],
  );
  const createAccounts = useMemo(
    () => (createMode === 'deposit' ? savingsAccounts : investmentAccounts),
    [createMode, investmentAccounts, savingsAccounts],
  );
  const importAccounts = useMemo(
    () =>
      importSource === 'degiro'
        ? brokerageAccounts
        : importSource === 'binance'
          ? exchangeAccounts
          : investmentFundAccounts,
    [brokerageAccounts, exchangeAccounts, importSource, investmentFundAccounts],
  );

  useEffect(() => {
    if (
      initialAccounts !== undefined &&
      initialAssets !== undefined &&
      initialRows !== undefined
    ) {
      return;
    }
    void load();
  }, [initialAccounts, initialAssets, initialRows, load]);

  useEffect(() => {
    const defaultCreateAccountId = createAccounts[0]?.id ?? '';
    if (!createAccounts.some((account) => account.id === form.accountId)) {
      setForm((current) => ({
        ...current,
        accountId: defaultCreateAccountId,
      }));
    }
    const defaultImportAccountId = importAccounts[0]?.id ?? '';
    if (!importAccounts.some((account) => account.id === importAccountId)) {
      setImportAccountId(defaultImportAccountId);
    }
  }, [createAccounts, form.accountId, importAccountId, importAccounts]);

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
      const net = Number(form.dividendNet || '0');
      return toEur(net);
    }
    return 0;
  }, [createMode, depositAmount, form]);

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

    setIsSaving(true);
    try {
      if (createMode === 'deposit') {
        if (!form.accountId) {
          setErrorMessage(
            'Select a savings account before creating a deposit.',
          );
          return;
        }
        const amount = Number(depositAmount || '0');
        if (!Number.isFinite(amount) || amount <= 0) {
          setErrorMessage('Deposit amount must be greater than 0.');
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
          setErrorMessage(validation.message);
          return;
        }

        await apiRequest('/finances/asset-transactions', {
          method: 'POST',
          body: JSON.stringify(validation.normalized),
        });
        setForm(initialForm(validation.normalized.accountId));
      }

      setIsCreateModalOpen(false);
      await load();
      router.refresh();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTransaction = async (transaction: UnifiedTransactionRow) => {
    if (transaction.rowKind !== 'asset_transaction') {
      return;
    }
    setConfirmDeleteTransaction(transaction);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteTransaction) {
      return;
    }

    setDeletingTransactionId(confirmDeleteTransaction.id);
    try {
      await apiRequest(
        `/finances/asset-transactions/${confirmDeleteTransaction.id}`,
        {
          method: 'DELETE',
        },
      );
      await load();
      router.refresh();
      setErrorMessage(null);
      setConfirmDeleteTransaction(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const onImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setImportFile(next);
    setImportResult(null);
  };

  const runImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedSourceLabel =
      importSource === 'degiro'
        ? 'DEGIRO'
        : importSource === 'binance'
          ? 'Binance'
          : 'COBAS';
    if (!importAccountId) {
      setErrorMessage(
        `Select a compatible ${selectedSourceLabel} account before importing.`,
      );
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
      const endpoint =
        importSource === 'degiro'
          ? '/finances/import/degiro-transactions'
          : importSource === 'binance'
            ? '/finances/import/binance-transactions'
            : '/finances/import/cobas-transactions';
      const result = await apiRequest<TransactionsImportResult>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          accountId: importAccountId,
          fileName: importFile.name,
          csvText,
          dryRun: importDryRun,
        }),
      });
      setImportResult(result);
      setErrorMessage(null);
      await load();
      router.refresh();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  const totalBuys = useMemo(() => {
    return rows
      .filter(
        (row) =>
          row.rowKind === 'asset_transaction' && row.transactionType === 'buy',
      )
      .reduce((sum, row) => sum + Math.abs(row.cashImpactEur), 0);
  }, [rows]);

  const totalSells = useMemo(() => {
    return rows
      .filter(
        (row) =>
          row.rowKind === 'asset_transaction' && row.transactionType === 'sell',
      )
      .reduce((sum, row) => sum + row.cashImpactEur, 0);
  }, [rows]);

  const assetNameById = useMemo(() => {
    return new Map(assets.map((asset) => [asset.id, asset.name]));
  }, [assets]);

  const getAssetName = useCallback(
    (row: UnifiedTransactionRow) => {
      if (!row.assetId) {
        return '-';
      }
      const assetName = assetNameById.get(row.assetId);
      if (assetName) {
        return assetName;
      }
      if (row.assetLabel?.includes('·')) {
        return row.assetLabel.split('·').at(-1)?.trim() ?? row.assetLabel;
      }
      return row.assetLabel ?? '-';
    },
    [assetNameById],
  );

  const typeFilterOptions = useMemo<TimelineFilterOption[]>(() => {
    const options = new Map<string, string>();
    for (const row of rows) {
      options.set(getRowTypeKey(row), getRowTypeLabel(row));
    }
    return [
      { value: 'all', label: 'All Types' },
      ...Array.from(options.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const assetFilterOptions = useMemo<TimelineFilterOption[]>(() => {
    const options = new Map<string, string>();
    for (const row of rows) {
      if (!row.assetId) continue;
      options.set(row.assetId, getAssetName(row));
    }
    return [
      { value: 'all', label: 'All Assets' },
      ...Array.from(options.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [getAssetName, rows]);

  const assetTypeFilterOptions = useMemo<TimelineFilterOption[]>(() => {
    const options = new Map<string, string>();
    for (const row of rows) {
      if (!row.assetType) continue;
      options.set(row.assetType, prettyAssetType(row.assetType));
    }
    return [
      { value: 'all', label: 'All Asset Types' },
      ...Array.from(options.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesType =
        typeFilter === 'all' || getRowTypeKey(row) === typeFilter;
      const matchesAsset = assetFilter === 'all' || row.assetId === assetFilter;
      const matchesAssetType =
        assetTypeFilter === 'all' || row.assetType === assetTypeFilter;
      return matchesType && matchesAsset && matchesAssetType;
    });
  }, [assetFilter, assetTypeFilter, rows, typeFilter]);

  useEffect(() => {
    setTimelinePage(1);
  }, [typeFilter, assetFilter, assetTypeFilter, timelinePageSize]);

  const totalTimelinePages = Math.max(
    1,
    Math.ceil(filteredRows.length / timelinePageSize),
  );
  const activeTimelinePage = Math.min(timelinePage, totalTimelinePages);
  const paginatedRows = useMemo(() => {
    const start = (activeTimelinePage - 1) * timelinePageSize;
    return filteredRows.slice(start, start + timelinePageSize);
  }, [activeTimelinePage, filteredRows, timelinePageSize]);

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
            Register operations and import DEGIRO, Binance, or COBAS CSV files.
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Buy Outflows"
          value={
            <span className="sb-sensitive-value">{formatMoney(totalBuys)}</span>
          }
        />
        <KpiCard
          label="Sell Inflows"
          value={
            <span className="sb-sensitive-value">
              {formatMoney(totalSells)}
            </span>
          }
        />
        <KpiCard label="Transactions" value={String(rows.length)} />
      </section>

      <Card title="Transactions Timeline">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <label
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="timeline-filter-type"
            >
              Type
            </label>
            <select
              id="timeline-filter-type"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              {typeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="timeline-filter-asset"
            >
              Asset
            </label>
            <select
              id="timeline-filter-asset"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
            >
              {assetFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="timeline-filter-asset-type"
            >
              Asset Type
            </label>
            <select
              id="timeline-filter-asset-type"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={assetTypeFilter}
              onChange={(event) => setAssetTypeFilter(event.target.value)}
            >
              {assetTypeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <LoadingSkeleton lines={8} />
        ) : filteredRows.length === 0 ? (
          <EmptyState message="No transactions for the selected filters." />
        ) : (
          <>
            <DataTable
              columns={[
                {
                  key: 'occurredAt',
                  header: 'Date',
                  sortValue: (row: UnifiedTransactionRow) =>
                    new Date(row.occurredAt),
                  render: (row: UnifiedTransactionRow) =>
                    formatDateTime(row.occurredAt),
                },
                {
                  key: 'type',
                  header: 'Type',
                  sortValue: (row: UnifiedTransactionRow) => prettyTxType(row),
                  render: (row: UnifiedTransactionRow) => prettyTxType(row),
                },
                {
                  key: 'asset',
                  header: 'Asset',
                  sortValue: (row: UnifiedTransactionRow) => getAssetName(row),
                  render: (row: UnifiedTransactionRow) => getAssetName(row),
                },
                {
                  key: 'assetType',
                  header: 'Asset Type',
                  sortValue: (row: UnifiedTransactionRow) =>
                    prettyAssetType(row.assetType),
                  render: (row: UnifiedTransactionRow) =>
                    prettyAssetType(row.assetType),
                },
                {
                  key: 'native',
                  header: 'Amount',
                  sortValue: (row: UnifiedTransactionRow) => row.amountNative,
                  render: (row: UnifiedTransactionRow) => (
                    <span className="sb-sensitive-value">
                      {formatAmountWithCurrency(row.amountNative, row.currency)}
                    </span>
                  ),
                },
                {
                  key: 'cash',
                  header: 'Cash Impact EUR',
                  sortValue: (row: UnifiedTransactionRow) => row.cashImpactEur,
                  render: (row: UnifiedTransactionRow) => (
                    <span className="sb-sensitive-value">
                      {formatMoney(row.cashImpactEur)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (row: UnifiedTransactionRow) =>
                    row.rowKind === 'asset_transaction' ? (
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
                    ) : (
                      '-'
                    ),
                },
              ]}
              rows={paginatedRows}
              rowKey={(row) => row.id}
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                Showing {(activeTimelinePage - 1) * timelinePageSize + 1}-
                {Math.min(
                  activeTimelinePage * timelinePageSize,
                  filteredRows.length,
                )}{' '}
                of {filteredRows.length}
              </p>
              <div className="flex items-center gap-2">
                <label
                  className="text-xs uppercase tracking-wide"
                  htmlFor="timeline-page-size"
                >
                  Rows
                </label>
                <select
                  id="timeline-page-size"
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={timelinePageSize}
                  onChange={(event) =>
                    setTimelinePageSize(Number(event.target.value))
                  }
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={activeTimelinePage <= 1}
                  onClick={() =>
                    setTimelinePage((current) => Math.max(1, current - 1))
                  }
                >
                  Previous
                </Button>
                <span>
                  Page {activeTimelinePage} / {totalTimelinePages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={activeTimelinePage >= totalTimelinePages}
                  onClick={() =>
                    setTimelinePage((current) =>
                      Math.min(totalTimelinePages, current + 1),
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </>
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
              htmlFor="transaction-create-mode"
            >
              Entry Type
            </label>
            <select
              id="transaction-create-mode"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={createMode}
              onChange={(event) =>
                setCreateMode(event.target.value as TransactionCreateMode)
              }
            >
              <option value="asset_transaction">Asset Transaction</option>
              <option value="deposit">Savings Deposit</option>
            </select>
          </div>

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
                  <label
                    className="text-sm font-medium"
                    htmlFor="transaction-type"
                  >
                    Transaction Type
                  </label>
                  <select
                    id="transaction-type"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.transactionType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        transactionType: event.target
                          .value as AssetTransactionType,
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
                <label
                  className="text-sm font-medium"
                  htmlFor="transaction-asset"
                >
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

          {createMode === 'deposit' ? (
            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="transaction-deposit"
              >
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
          (form.transactionType === 'buy' ||
            form.transactionType === 'sell') ? (
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
          ) : null}

          {createMode === 'asset_transaction' &&
          form.transactionType === 'dividend' ? (
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
                          event.target.value === 'EUR'
                            ? ''
                            : current.fxRateToEur,
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
                  <label
                    className="text-sm font-medium"
                    htmlFor="transaction-fees"
                  >
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

          <p className="text-xs text-muted-foreground">
            Cash impact preview:{' '}
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

          <Button type="submit" variant="primary" disabled={isSaving} fullWidth>
            {isSaving
              ? 'Saving...'
              : createMode === 'deposit'
                ? 'Create Deposit'
                : 'Create Transaction'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={isImportModalOpen}
        title={`Import ${
          importSource === 'degiro'
            ? 'DEGIRO'
            : importSource === 'binance'
              ? 'Binance'
              : 'COBAS'
        } Transactions CSV`}
        onClose={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={runImport}>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="import-source">
              Source
            </label>
            <select
              id="import-source"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={importSource}
              onChange={(event) => {
                setImportSource(event.target.value as ImportSource);
                setImportResult(null);
              }}
            >
              <option value="degiro">DEGIRO</option>
              <option value="binance">Binance</option>
              <option value="cobas">COBAS</option>
            </select>
          </div>

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
              <option value="">
                {importSource === 'degiro'
                  ? 'Select brokerage account'
                  : importSource === 'binance'
                    ? 'Select exchange account'
                    : 'Select investment fund account'}
              </option>
              {importAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
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
            Dry run (validate and persist import report without inserts)
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
              Source:{' '}
              {importResult.source === 'degiro'
                ? 'DEGIRO Transactions'
                : importResult.source === 'binance'
                  ? 'Binance Transactions'
                  : 'COBAS Transactions'}{' '}
              · {importResult.dryRun ? 'Dry run' : 'Committed'} · Rows{' '}
              {importResult.totalRows}
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

      <ConfirmModal
        open={Boolean(confirmDeleteTransaction)}
        title="Delete Transaction"
        description={
          confirmDeleteTransaction
            ? `Delete ${prettyTxType(confirmDeleteTransaction)} transaction from ${formatDateTime(
                confirmDeleteTransaction.occurredAt,
              )}?`
            : ''
        }
        confirmLabel="Delete Transaction"
        confirmVariant="danger"
        isLoading={Boolean(deletingTransactionId)}
        onCancel={() => setConfirmDeleteTransaction(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
