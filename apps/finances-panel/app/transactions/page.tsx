'use client';

import type { Account, Transaction } from '@second-brain/types';
import {
  AllocationDonutChart,
  Card,
  DataTable,
  KpiCard,
} from '@second-brain/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { loadAccountsData } from '../../lib/data/accounts-data';
import { loadTransactionsData } from '../../lib/data/transactions-data';
import { getApiErrorMessage } from '../../lib/errors';
import { formatMoney } from '../../lib/format';
import {
  type TransactionFormInput,
  toInputDate,
  validateTransactionForm,
} from '../../lib/transactions';

const initialForm = (accountId = ''): TransactionFormInput => ({
  accountId,
  postedAt: new Date().toISOString().slice(0, 10),
  amount: '',
  description: '',
  category: '',
});

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [source, setSource] = useState<'api' | 'mock'>('mock');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<TransactionFormInput>(initialForm());
  const [editForm, setEditForm] = useState<TransactionFormInput>(initialForm());

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsData, transactionsData] = await Promise.all([
        loadAccountsData(),
        loadTransactionsData(),
      ]);

      setAccounts(accountsData.rows);
      setRows(transactionsData.rows);
      setSource(
        accountsData.source === 'api' || transactionsData.source === 'api'
          ? 'api'
          : 'mock',
      );

      const defaultAccountId = accountsData.rows[0]?.id ?? '';
      setForm((current) => ({
        ...current,
        accountId: current.accountId || defaultAccountId,
      }));
      setEditForm((current) => ({
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

  useEffect(() => {
    void load();
  }, [load]);

  const createTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateTransactionForm(form);
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest('/finances/transactions', {
        method: 'POST',
        body: JSON.stringify(validation.normalized),
      });
      setForm(initialForm(validation.normalized.accountId));
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (row: Transaction) => {
    setEditingId(row.id);
    setEditForm({
      accountId: row.accountId,
      postedAt: toInputDate(row.postedAt),
      amount: String(row.amount),
      description: row.description,
      category: row.category,
    });
    setErrorMessage(null);
  };

  const updateTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    const validation = validateTransactionForm(editForm);
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    setIsUpdating(true);
    try {
      await apiRequest(`/finances/transactions/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(validation.normalized),
      });
      setEditingId(null);
      setEditForm(initialForm(editForm.accountId));
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    setDeletingId(id);
    try {
      await apiRequest(`/finances/transactions/${id}`, { method: 'DELETE' });
      if (editingId === id) {
        setEditingId(null);
      }
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const inflow = useMemo(() => {
    return rows
      .filter((row) => row.amount > 0)
      .reduce((sum, row) => sum + row.amount, 0);
  }, [rows]);

  const outflow = useMemo(() => {
    return rows
      .filter((row) => row.amount < 0)
      .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  }, [rows]);

  const categorySummary = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const row of rows) {
      const amount = Math.abs(row.amount);
      byCategory.set(
        row.category,
        (byCategory.get(row.category) ?? 0) + amount,
      );
    }

    const total = [...byCategory.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    const palette = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#22d3ee'];
    return [...byCategory.entries()].map(([label, value], index) => ({
      label,
      value,
      percent: total === 0 ? 0 : Number(((value / total) * 100).toFixed(2)),
      color: palette[index % palette.length] ?? '#34d399',
    }));
  }, [rows]);

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <header>
        <h1>Transactions</h1>
        <p className="small">
          Activity ledger with category composition and live CRUD.
        </p>
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
        <KpiCard label="Monthly Inflow" value={formatMoney(inflow)} />
        <KpiCard label="Monthly Outflow" value={formatMoney(outflow)} />
        <KpiCard label="Net Flow" value={formatMoney(inflow - outflow)} />
      </section>

      <div className="grid two-col" style={{ gap: '1rem' }}>
        <Card title="Create Transaction">
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
                  {account.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.postedAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  postedAt: event.target.value,
                }))
              }
              required
            />
            <input
              value={form.amount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder="Amount (e.g. -240 or 5800)"
              required
            />
            <input
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Description"
              required
            />
            <input
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
              placeholder="Category"
              required
            />
            <button type="submit" disabled={isSaving || accounts.length === 0}>
              {isSaving ? 'Saving...' : 'Create Transaction'}
            </button>
          </form>
        </Card>

        <Card title="Flow Composition">
          <AllocationDonutChart data={categorySummary} />
        </Card>
      </div>

      {editingId ? (
        <Card title="Edit Transaction">
          <form className="form-grid" onSubmit={updateTransaction}>
            <select
              value={editForm.accountId}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  accountId: event.target.value,
                }))
              }
              required
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={editForm.postedAt}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  postedAt: event.target.value,
                }))
              }
              required
            />
            <input
              value={editForm.amount}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              required
            />
            <input
              value={editForm.description}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              required
            />
            <input
              value={editForm.category}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
              required
            />
            <div className="top-nav-actions">
              <button type="submit" disabled={isUpdating}>
                {isUpdating ? 'Updating...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Transactions Table">
        {isLoading ? (
          <p className="small">Loading transactions...</p>
        ) : (
          <DataTable
            columns={[
              {
                key: 'date',
                header: 'Date',
                render: (row: Transaction) => toInputDate(row.postedAt),
              },
              {
                key: 'description',
                header: 'Description',
                render: (row: Transaction) => row.description,
              },
              {
                key: 'category',
                header: 'Category',
                render: (row: Transaction) => row.category,
              },
              {
                key: 'amount',
                header: 'Amount',
                render: (row: Transaction) => formatMoney(row.amount),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row: Transaction) => (
                  <div className="top-nav-actions">
                    <button type="button" onClick={() => startEditing(row)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTransaction(row.id)}
                      disabled={deletingId === row.id}
                    >
                      {deletingId === row.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ),
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
