'use client';

import type { Account } from '@second-brain/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../../lib/api';
import { loadAccountsData } from '../../../lib/data/accounts-data';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatDate, formatMoney } from '../../../lib/format';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { PriceLineChart } from '../../ui/charts/price-line-chart';
import { ConfirmModal } from '../../ui/confirm-modal';
import { DataTable } from '../../ui/data-table';
import { KpiCard } from '../../ui/kpi-card';
import { Modal } from '../../ui/modal';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../ui/states';

type CreatableAccountType =
  | 'savings'
  | 'brokerage'
  | 'crypto_exchange'
  | 'investment_platform'
  | 'retirement_plan';

const accountTypeLabel = (accountType: string) => {
  if (accountType === 'brokerage') return 'Broker';
  if (accountType === 'crypto_exchange') return 'Exchange';
  if (accountType === 'investment_platform') return 'Investment Fund Account';
  if (accountType === 'retirement_plan') return 'Retirement Plan';
  if (accountType === 'savings') return 'Savings';
  return accountType;
};

type AccountsFeatureProps = {
  initialRows?: Account[];
};

export function AccountsFeature({ initialRows }: AccountsFeatureProps) {
  const router = useRouter();
  const [rows, setRows] = useState<Account[]>(initialRows ?? []);
  const [isLoading, setIsLoading] = useState(initialRows === undefined);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [name, setName] = useState('');
  const [accountType, setAccountType] =
    useState<CreatableAccountType>('brokerage');
  const [currentCash, setCurrentCash] = useState('0');

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
    if (initialRows !== undefined) {
      return;
    }
    void load();
  }, [initialRows, load]);

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    if (!normalizedName) {
      setErrorMessage('Account name is required.');
      return;
    }

    let openingBalanceEur = 0;
    if (accountType === 'savings') {
      const parsedCash = Number(currentCash || '0');
      if (!Number.isFinite(parsedCash) || parsedCash < 0) {
        setErrorMessage('Current Cash (EUR) must be a non-negative number.');
        return;
      }
      openingBalanceEur = parsedCash;
    }

    setIsCreating(true);
    setInfoMessage(null);
    try {
      const created = await apiRequest<Account>('/finances/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: normalizedName,
          currency: 'EUR',
          baseCurrency: 'EUR',
          openingBalanceEur,
          accountType,
        }),
      });

      setName('');
      setAccountType('brokerage');
      setCurrentCash('0');
      setIsCreateModalOpen(false);
      await load();
      router.refresh();
      setInfoMessage(`Account "${created.name}" created successfully.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const deleteAccount = (accountId: string, accountName: string) => {
    setConfirmDeleteAccount({ id: accountId, name: accountName });
  };

  const confirmDelete = async () => {
    if (!confirmDeleteAccount) {
      return;
    }

    setDeletingAccountId(confirmDeleteAccount.id);
    try {
      await apiRequest(`/finances/accounts/${confirmDeleteAccount.id}`, {
        method: 'DELETE',
      });
      await load();
      router.refresh();
      setErrorMessage(null);
      setConfirmDeleteAccount(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeletingAccountId(null);
    }
  };

  const savingsRows = useMemo(
    () => rows.filter((row) => row.accountType === 'savings'),
    [rows],
  );

  const netCash = useMemo(
    () =>
      savingsRows.reduce(
        (sum, row) => sum + Number(row.currentCashBalanceEur),
        0,
      ),
    [savingsRows],
  );
  const positive = savingsRows.filter(
    (row) => row.currentCashBalanceEur >= 0,
  ).length;
  const chartRows = savingsRows.map((row) => ({
    label: row.name.slice(0, 10),
    value: row.currentCashBalanceEur,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Savings cash and investment account registry.
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
        <KpiCard
          label="Net Cash (EUR)"
          value={
            <span className="sb-sensitive-value">{formatMoney(netCash)}</span>
          }
        />
        <KpiCard label="Non-Negative Savings" value={String(positive)} />
        <KpiCard label="Savings Accounts" value={String(savingsRows.length)} />
        <KpiCard label="Total Accounts" value={String(rows.length)} />
      </section>

      <Card title="Savings Cash Trend">
        {chartRows.length === 0 ? (
          <EmptyState message="No savings balances to chart yet." />
        ) : (
          <div className="sb-sensitive-chart">
            <PriceLineChart data={chartRows} />
          </div>
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
                sortValue: (row: Account) => row.name,
                render: (row: Account) => row.name,
              },
              {
                key: 'type',
                header: 'Type',
                sortValue: (row: Account) => accountTypeLabel(row.accountType),
                render: (row: Account) => accountTypeLabel(row.accountType),
              },
              {
                key: 'currency',
                header: 'Currency',
                sortValue: (row: Account) => row.currency,
                render: (row: Account) => row.currency,
              },
              {
                key: 'cash',
                header: 'Cash EUR',
                sortValue: (row: Account) =>
                  row.accountType === 'savings'
                    ? row.currentCashBalanceEur
                    : null,
                render: (row: Account) =>
                  row.accountType === 'savings' ? (
                    <span className="sb-sensitive-value">
                      {formatMoney(row.currentCashBalanceEur)}
                    </span>
                  ) : (
                    '-'
                  ),
              },
              {
                key: 'created',
                header: 'Created',
                sortValue: (row: Account) => new Date(row.createdAt),
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
            <label className="text-sm font-medium" htmlFor="account-name">
              Name
            </label>
            <input
              id="account-name"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="account-type">
              Type
            </label>
            <select
              id="account-type"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={accountType}
              onChange={(event) =>
                setAccountType(event.target.value as CreatableAccountType)
              }
            >
              <option value="savings">Savings</option>
              <option value="brokerage">Broker</option>
              <option value="crypto_exchange">Exchange</option>
              <option value="investment_platform">
                Investment Fund Account
              </option>
              <option value="retirement_plan">Retirement Plan</option>
            </select>
          </div>

          {accountType === 'savings' ? (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="account-cash">
                Current Cash (EUR)
              </label>
              <input
                id="account-cash"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                step="0.01"
                min="0"
                value={currentCash}
                onChange={(event) => setCurrentCash(event.target.value)}
                required
              />
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            disabled={isCreating}
            fullWidth
          >
            {isCreating ? 'Creating...' : 'Create Account'}
          </Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(confirmDeleteAccount)}
        title="Delete Account"
        description={
          confirmDeleteAccount
            ? `Delete account "${confirmDeleteAccount.name}"? This will also delete its transactions.`
            : ''
        }
        confirmLabel="Delete Account"
        confirmVariant="danger"
        isLoading={Boolean(deletingAccountId)}
        onCancel={() => setConfirmDeleteAccount(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
