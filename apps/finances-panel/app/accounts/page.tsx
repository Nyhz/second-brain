'use client';

import type { Account } from '@second-brain/types';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  KpiCard,
  Modal,
  PriceLineChart,
} from '../../components/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { loadAccountsData } from '../../lib/data/accounts-data';
import { getApiErrorMessage } from '../../lib/errors';
import { formatDate, formatMoney } from '../../lib/format';

export default function AccountsPage() {
  const [rows, setRows] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [openingBalanceEur, setOpeningBalanceEur] = useState('0');
  const [accountType, setAccountType] = useState('checking');

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
          currency: currency.toUpperCase(),
          baseCurrency: 'EUR',
          openingBalanceEur: Number(openingBalanceEur || '0'),
          accountType,
        }),
      });
      setName('');
      setCurrency('USD');
      setOpeningBalanceEur('0');
      setIsCreateModalOpen(false);
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
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
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Accounts</h1>
          <p className="small">Liquidity and cash-flow accounts overview.</p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Account
        </Button>
      </header>
      {errorMessage ? (
        <p className="small" style={{ color: '#f87171' }}>
          {errorMessage}
        </p>
      ) : null}

      <section className="sb-grid-kpi">
        <KpiCard label="Net Cash (EUR)" value={formatMoney(netCash)} />
        <KpiCard label="Non-Negative Accounts" value={String(positive)} />
        <KpiCard label="Report Date" value={formatDate(new Date().toISOString())} />
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
          <p className="small">Loading accounts...</p>
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
                render: (row: Account) => row.accountType,
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
        <form className="form-grid" onSubmit={createAccount}>
          <input
            value={name}
            placeholder="Account name"
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            value={currency}
            maxLength={3}
            placeholder="Currency"
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            required
          />
          <input
            value={openingBalanceEur}
            placeholder="Opening balance EUR"
            onChange={(e) => setOpeningBalanceEur(e.target.value)}
            required
          />
          <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
          <Button type="submit" variant="primary" disabled={isCreating} fullWidth>
            {isCreating ? 'Creating...' : 'Create Account'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
