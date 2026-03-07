import type { Account } from '@second-brain/types';
import { formatMoney } from '../../../lib/format';
import { KpiCard } from '../../ui/kpi-card';
import { AccountsCashTrendSection } from './accounts-cash-trend-section';
import { AccountsHeaderActions } from './accounts-header-actions';
import { AccountsTableSection } from './accounts-table-section';

type AccountsFeatureProps = {
  direction: 'asc' | 'desc';
  rows: Account[];
  sort: 'cash' | 'created' | 'currency' | 'name' | 'type';
};

export function AccountsFeature({
  direction,
  rows,
  sort,
}: AccountsFeatureProps) {
  const savingsRows = rows.filter((row) => row.accountType === 'savings');
  const netCash = savingsRows.reduce(
    (sum, row) => sum + Number(row.currentCashBalanceEur),
    0,
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
        <AccountsHeaderActions />
      </div>

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

      <AccountsCashTrendSection data={chartRows} />

      <AccountsTableSection direction={direction} rows={rows} sort={sort} />
    </div>
  );
}
