'use client';

import type { Account } from '@second-brain/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
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

  const [name, setName] = useState('');
  const [openingBalanceEur, setOpeningBalanceEur] = useState('0');
  const [accountType, setAccountType] = useState('brokerage');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadAccountsData();
      setRows(data.rows);
      setErrorMessage(null);
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

    setIsCreating(true);
    try {
      await apiRequest('/finances/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          currency: 'EUR',
          baseCurrency: 'EUR',
          openingBalanceEur: Number(openingBalanceEur || '0'),
          accountType,
        }),
      });
      setName('');
      setOpeningBalanceEur('0');
      setAccountType('brokerage');
      setIsCreateModalOpen(false);
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
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
            {isCreating ? 'Creating...' : 'Create Account'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
