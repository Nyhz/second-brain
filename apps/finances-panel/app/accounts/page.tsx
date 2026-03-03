'use client';

import type { Account } from '@second-brain/types';
import { Card, DataTable, KpiCard, PriceLineChart } from '@second-brain/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { loadAccountsData } from '../../lib/data/accounts-data';
import { getApiErrorMessage } from '../../lib/errors';
import { formatMoney } from '../../lib/format';
import { buildSeries, dayKey } from '../../lib/mock/seed';

export default function AccountsPage() {
  const [rows, setRows] = useState<Account[]>([]);
  const [source, setSource] = useState<'api' | 'mock'>('mock');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [accountType, setAccountType] = useState('checking');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadAccountsData();
      setRows(data.rows);
      setSource(data.source);
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
          accountType,
        }),
      });
      setName('');
      setCurrency('USD');
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const netCash = useMemo(() => {
    return rows.reduce(
      (sum, row) => sum + (row.accountType === 'credit' ? -500 : 1000),
      0,
    );
  }, [rows]);

  const positive = rows.filter((row) => row.accountType !== 'credit').length;

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <header>
        <h1>Accounts</h1>
        <p className="small">Liquidity and cash-flow accounts overview.</p>
        <p className="small">Source: {source.toUpperCase()}</p>
      </header>
      {errorMessage ? (
        <p className="small" style={{ color: '#f87171' }}>
          {errorMessage}
        </p>
      ) : null}

      <section
        className="grid kpi"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}
      >
        <KpiCard label="Net Cash (Estimated)" value={formatMoney(netCash)} />
        <KpiCard label="Positive Accounts" value={String(positive)} />
        <KpiCard label="Report Date" value={dayKey()} />
      </section>

      <div className="grid two-col" style={{ gap: '1rem' }}>
        <Card title="Add Account">
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
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
            <button type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </Card>

        <Card title="Cash Balance Trend">
          <PriceLineChart
            data={buildSeries(
              `accounts-${dayKey()}`,
              20,
              Math.max(netCash, 5000),
            )}
          />
        </Card>
      </div>

      <Card title="Accounts Table">
        {isLoading ? (
          <p className="small">Loading accounts...</p>
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
                key: 'created',
                header: 'Created',
                render: (row: Account) =>
                  new Date(row.createdAt).toLocaleDateString(),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
          />
        )}
      </Card>
    </div>
  );
}
