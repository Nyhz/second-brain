import Link from 'next/link';
import { apiRequest } from '../lib/api';

type Summary = {
  totalBalance: number;
  accountCount: number;
  transactionCount: number;
  monthlyInflow: number;
  monthlyOutflow: number;
};

type Transaction = {
  id: string;
  description: string;
  category: string;
  amount: string;
  postedAt: string;
};

export default async function DashboardPage() {
  const [summary, transactions] = await Promise.all([
    apiRequest<Summary>('/finances/summary'),
    apiRequest<Transaction[]>('/finances/transactions'),
  ]);

  return (
    <div className="grid" style={{ gap: '1.5rem' }}>
      <header>
        <h1>Finances Dashboard</h1>
        <p className="small">Local-first personal finance command center</p>
      </header>

      <section className="grid kpi">
        <div className="card">
          <h2>Total Balance</h2>
          <div>${summary.totalBalance.toFixed(2)}</div>
        </div>
        <div className="card">
          <h2>Accounts</h2>
          <div>{summary.accountCount}</div>
        </div>
        <div className="card">
          <h2>Transactions</h2>
          <div>{summary.transactionCount}</div>
        </div>
        <div className="card">
          <h2>Monthly Inflow</h2>
          <div>${summary.monthlyInflow.toFixed(2)}</div>
        </div>
        <div className="card">
          <h2>Monthly Outflow</h2>
          <div>${summary.monthlyOutflow.toFixed(2)}</div>
        </div>
      </section>

      <section className="card">
        <h2>Actions</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/accounts">Manage Accounts</Link>
          <Link href="/transactions">Manage Transactions</Link>
        </div>
      </section>

      <section className="card">
        <h2>Recent Transactions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.slice(0, 10).map((tx) => (
              <tr key={tx.id}>
                <td>{new Date(tx.postedAt).toLocaleDateString()}</td>
                <td>{tx.description}</td>
                <td>{tx.category}</td>
                <td>{Number(tx.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
