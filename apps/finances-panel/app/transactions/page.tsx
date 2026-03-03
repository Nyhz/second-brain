'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../lib/api';

type Account = {
  id: string;
  name: string;
};

type Transaction = {
  id: string;
  accountId: string;
  postedAt: string;
  amount: string;
  description: string;
  category: string;
};

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [accountId, setAccountId] = useState('');
  const [postedAt, setPostedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState('0');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');

  const load = useCallback(async () => {
    const [accountRows, txRows] = await Promise.all([
      apiRequest<Account[]>('/finances/accounts'),
      apiRequest<Transaction[]>('/finances/transactions'),
    ]);

    setAccounts(accountRows);
    setTransactions(txRows);
    setAccountId((previous) => previous || accountRows[0]?.id || '');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await apiRequest('/finances/transactions', {
      method: 'POST',
      body: JSON.stringify({
        accountId,
        postedAt: new Date(postedAt).toISOString(),
        amount: Number(amount),
        description,
        category,
      }),
    });

    setAmount('0');
    setDescription('');
    await load();
  };

  const removeTransaction = async (id: string) => {
    await apiRequest(`/finances/transactions/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <h1>Transactions</h1>

      <section className="card">
        <h2>Create Transaction</h2>
        <form onSubmit={createTransaction}>
          <select
            required
            value={accountId}
            onChange={(e: { target: { value: string } }) =>
              setAccountId(e.target.value)
            }
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <input
            required
            type="date"
            value={postedAt}
            onChange={(e: { target: { value: string } }) =>
              setPostedAt(e.target.value)
            }
          />
          <input
            required
            type="number"
            step="0.01"
            value={amount}
            onChange={(e: { target: { value: string } }) =>
              setAmount(e.target.value)
            }
          />
          <input
            required
            placeholder="Description"
            value={description}
            onChange={(e: { target: { value: string } }) =>
              setDescription(e.target.value)
            }
          />
          <input
            required
            placeholder="Category"
            value={category}
            onChange={(e: { target: { value: string } }) =>
              setCategory(e.target.value)
            }
          />
          <button type="submit">Create Transaction</button>
        </form>
      </section>

      <section className="card">
        <h2>All Transactions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td>{new Date(tx.postedAt).toLocaleDateString()}</td>
                <td>{tx.description}</td>
                <td>{tx.category}</td>
                <td>{Number(tx.amount).toFixed(2)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeTransaction(tx.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
