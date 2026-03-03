'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../lib/api';

type Account = {
  id: string;
  name: string;
  currency: string;
  accountType: string;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [accountType, setAccountType] = useState('checking');

  const load = useCallback(async () => {
    const rows = await apiRequest<Account[]>('/finances/accounts');
    setAccounts(rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await apiRequest('/finances/accounts', {
      method: 'POST',
      body: JSON.stringify({ name, currency, accountType }),
    });

    setName('');
    await load();
  };

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <h1>Accounts</h1>

      <section className="card">
        <h2>Create Account</h2>
        <form onSubmit={createAccount}>
          <input
            required
            placeholder="Account name"
            value={name}
            onChange={(e: { target: { value: string } }) =>
              setName(e.target.value)
            }
          />
          <input
            required
            maxLength={3}
            placeholder="Currency (USD)"
            value={currency}
            onChange={(e: { target: { value: string } }) =>
              setCurrency(e.target.value.toUpperCase())
            }
          />
          <select
            value={accountType}
            onChange={(e: { target: { value: string } }) =>
              setAccountType(e.target.value)
            }
          >
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
          <button type="submit">Create Account</button>
        </form>
      </section>

      <section className="card">
        <h2>Existing Accounts</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.accountType}</td>
                <td>{account.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
