'use client';

import type { Account } from '@second-brain/types';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { Button } from '../../ui/button';
import { Modal } from '../../ui/modal';
import {
  type ImportSource,
  isInvestmentAccount,
  type TransactionsImportResult,
} from './transactions-shared';

export function TransactionsImportModal({
  accounts,
  onClose,
  onError,
  onImported,
  open,
}: {
  accounts: Account[];
  onClose: () => void;
  onError: (message: string) => void;
  onImported: () => Promise<void>;
  open: boolean;
}) {
  const [importSource, setImportSource] = useState<ImportSource>('degiro');
  const [importAccountId, setImportAccountId] = useState('');
  const [importDryRun, setImportDryRun] = useState(true);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] =
    useState<TransactionsImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

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
        (account) =>
          isInvestmentAccount(account) &&
          account.accountType === 'investment_platform',
      ),
    [accounts],
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
    const defaultImportAccountId = importAccounts[0]?.id ?? '';
    if (!importAccounts.some((account) => account.id === importAccountId)) {
      setImportAccountId(defaultImportAccountId);
    }
  }, [importAccountId, importAccounts]);

  const failedImportRows = importResult
    ? importResult.results.filter((row) => row.status === 'failed').slice(0, 8)
    : [];

  const runImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedSourceLabel =
      importSource === 'degiro'
        ? 'DEGIRO'
        : importSource === 'binance'
          ? 'Binance'
          : 'COBAS';

    if (!importAccountId) {
      onError(
        `Select a compatible ${selectedSourceLabel} account before importing.`,
      );
      return;
    }
    if (!importFile) {
      onError('Select a CSV file to import.');
      return;
    }
    if (importFile.size > 5 * 1024 * 1024) {
      onError('CSV file is larger than 5MB.');
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
      onError('');
      await onImported();
    } catch (error) {
      onError(getApiErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Import ${
        importSource === 'degiro'
          ? 'DEGIRO'
          : importSource === 'binance'
            ? 'Binance'
            : 'COBAS'
      } Transactions CSV`}
      onClose={() => {
        if (!isImporting) {
          onClose();
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
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setImportFile(next);
              setImportResult(null);
            }}
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

        <Button type="submit" variant="primary" disabled={isImporting} fullWidth>
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
  );
}
