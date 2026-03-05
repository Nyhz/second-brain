'use client';

import type {
  Account,
  DegiroAccountStatementAnalyzeResult,
  DegiroAccountStatementImportResult,
} from '@second-brain/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest } from '../../../lib/api';
import { loadAccountsData } from '../../../lib/data/accounts-data';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatDate, formatMoney } from '../../../lib/format';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  Modal,
  PriceLineChart,
} from '../../ui';

export function AccountsFeature() {
  const [rows, setRows] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [creationMode, setCreationMode] = useState<'manual' | 'csv_import'>(
    'manual',
  );
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [openingBalanceEur, setOpeningBalanceEur] = useState('0');
  const [accountType, setAccountType] = useState('brokerage');
  const [statementFile, setStatementFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadAccountsData();
      setRows(data.rows);
      setErrorMessage(null);
      setInfoMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Account name is required.');
      return;
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setErrorMessage('Currency must be a valid 3-letter code (for example EUR).');
      return;
    }
    if (creationMode === 'csv_import' && !statementFile) {
      setErrorMessage('Select Account.csv before creating from import.');
      return;
    }
    if (statementFile && statementFile.size > 5 * 1024 * 1024) {
      setErrorMessage('CSV file is larger than 5MB.');
      return;
    }

    setIsCreating(true);
    setInfoMessage(null);
    let createdAccountId: string | null = null;
    try {
      const created = await apiRequest<Account>('/finances/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          currency: normalizedCurrency,
          baseCurrency: 'EUR',
          openingBalanceEur:
            creationMode === 'manual' ? Number(openingBalanceEur || '0') : 0,
          accountType,
        }),
      });
      createdAccountId = created.id;

      let importSummaryMessage = '';
      if (creationMode === 'csv_import' && statementFile) {
        const csvText = await statementFile.text();
        const fileName = statementFile.name;
        const analyze = await apiRequest<DegiroAccountStatementAnalyzeResult>(
          '/finances/import/degiro-account-statement/analyze',
          {
            method: 'POST',
            body: JSON.stringify({
              accountId: created.id,
              fileName,
              csvText,
            }),
          },
        );

        for (const unresolved of analyze.unresolvedAssets) {
          const symbol =
            unresolved.symbolHint?.trim().toUpperCase() ||
            unresolved.isin.slice(-6);
          await apiRequest('/finances/assets', {
            method: 'POST',
            body: JSON.stringify({
              name: unresolved.name,
              assetType: unresolved.typeHint,
              symbol,
              ticker: symbol,
              isin: unresolved.isin,
              currency: unresolved.currencyHint,
              quantity: 1,
              providerSymbol: symbol,
            }),
          });
        }

        const analyzeAfterResolve =
          analyze.unresolvedAssets.length > 0
            ? await apiRequest<DegiroAccountStatementAnalyzeResult>(
                '/finances/import/degiro-account-statement/analyze',
                {
                  method: 'POST',
                  body: JSON.stringify({
                    accountId: created.id,
                    fileName,
                    csvText,
                  }),
                },
              )
            : analyze;

        if (analyzeAfterResolve.unresolvedAssets.length > 0) {
          throw new Error(
            `Could not resolve all assets from CSV (${analyzeAfterResolve.unresolvedAssets.length} unresolved).`,
          );
        }

        const importResult = await apiRequest<DegiroAccountStatementImportResult>(
          '/finances/import/degiro-account-statement',
          {
            method: 'POST',
            body: JSON.stringify({
              accountId: created.id,
              fileName,
              csvText,
              dryRun: false,
            }),
          },
        );

        importSummaryMessage = ` · Import: ${importResult.importedRows} imported, ${importResult.skippedRows} skipped, ${importResult.failedRows} failed, cash delta ${formatMoney(importResult.deltaEur)}.`;
      }

      setCreationMode('manual');
      setName('');
      setCurrency('EUR');
      setOpeningBalanceEur('0');
      setAccountType('brokerage');
      setStatementFile(null);
      setIsCreateModalOpen(false);
      await load();
      setInfoMessage(
        `Account "${created.name}" created successfully${importSummaryMessage}`,
      );
    } catch (error) {
      if (createdAccountId && creationMode === 'csv_import') {
        try {
          await apiRequest(`/finances/accounts/${createdAccountId}`, {
            method: 'DELETE',
          });
          await load();
        } catch {
          // Keep the original error; rollback best-effort only.
        }
      }
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const onStatementFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setStatementFile(next);
  };

  const deleteAccount = async (accountId: string, accountName: string) => {
    if (
      !window.confirm(
        `Delete account "${accountName}"? This will also delete its transactions.`,
      )
    ) {
      return;
    }

    setDeletingAccountId(accountId);
    try {
      await apiRequest(`/finances/accounts/${accountId}`, {
        method: 'DELETE',
      });
      await load();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeletingAccountId(null);
    }
  };

  const netCash = useMemo(() => {
    return rows.reduce((sum, row) => sum + row.currentCashBalanceEur, 0);
  }, [rows]);

  const positive = rows.filter((row) => row.currentCashBalanceEur >= 0).length;
  const chartRows = rows.map((row) => ({
    label: row.name.slice(0, 10),
    value: row.currentCashBalanceEur,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Liquidity and cash-flow accounts overview.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Account
        </Button>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}
      {infoMessage ? (
        <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {infoMessage}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Net Cash (EUR)" value={formatMoney(netCash)} />
        <KpiCard label="Non-Negative Accounts" value={String(positive)} />
        <KpiCard label="Total Accounts" value={String(rows.length)} />
        <KpiCard
          label="Report Date"
          value={formatDate(new Date().toISOString())}
        />
      </section>

      <Card title="Cash Balance Trend">
        {chartRows.length === 0 ? (
          <EmptyState message="No account balances to chart yet." />
        ) : (
          <PriceLineChart data={chartRows} />
        )}
      </Card>

      <Card title="Accounts Table">
        {isLoading ? (
          <LoadingSkeleton lines={7} />
        ) : rows.length === 0 ? (
          <EmptyState message="No accounts yet." />
        ) : (
          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Account',
                render: (row: Account) => row.name,
              },
              {
                key: 'type',
                header: 'Type',
                render: (row: Account) => {
                  if (row.accountType === 'brokerage') return 'Broker';
                  if (row.accountType === 'crypto_exchange') return 'Exchange';
                  if (row.accountType === 'savings') return 'Savings';
                  return row.accountType;
                },
              },
              {
                key: 'currency',
                header: 'Currency',
                render: (row: Account) => row.currency,
              },
              {
                key: 'cash',
                header: 'Cash EUR',
                render: (row: Account) =>
                  formatMoney(row.currentCashBalanceEur),
              },
              {
                key: 'created',
                header: 'Created',
                render: (row: Account) => formatDate(row.createdAt),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row: Account) => (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={deletingAccountId === row.id}
                    onClick={() => void deleteAccount(row.id, row.name)}
                  >
                    {deletingAccountId === row.id ? 'Deleting...' : 'Delete'}
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
        title="Create Account"
        onClose={() => {
          if (!isCreating) {
            setIsCreateModalOpen(false);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={createAccount}>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Creation Method</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="account-create-mode"
                  value="manual"
                  checked={creationMode === 'manual'}
                  onChange={() => setCreationMode('manual')}
                />
                Manual Opening Cash
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="account-create-mode"
                  value="csv_import"
                  checked={creationMode === 'csv_import'}
                  onChange={() => setCreationMode('csv_import')}
                />
                Import Account.csv
              </label>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="account-name">
              Name
            </label>
            <input
              id="account-name"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="account-currency">
              Currency
            </label>
            <input
              id="account-currency"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              required
            />
          </div>
          {creationMode === 'manual' ? (
            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="account-opening-balance"
              >
                Starting Cash (EUR)
              </label>
              <input
                id="account-opening-balance"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                step="0.01"
                min="0"
                value={openingBalanceEur}
                onChange={(e) => setOpeningBalanceEur(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="account-csv-file">
                Account Statement CSV
              </label>
              <input
                id="account-csv-file"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="file"
                accept=".csv,text/csv"
                onChange={onStatementFileChange}
                required
              />
              <p className="text-xs text-muted-foreground">
                Creates the account with opening cash at 0 and imports statement
                movements to reconstruct cash and transactions.
              </p>
            </div>
          )}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="account-type">
              Type
            </label>
            <select
              id="account-type"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
            >
              <option value="savings">Savings</option>
              <option value="brokerage">Broker</option>
              <option value="crypto_exchange">Exchange</option>
            </select>
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={isCreating}
            fullWidth
          >
            {isCreating
              ? creationMode === 'csv_import'
                ? 'Creating & Importing...'
                : 'Creating...'
              : creationMode === 'csv_import'
                ? 'Create Account from CSV'
                : 'Create Account'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
