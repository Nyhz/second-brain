import type { Account } from '@second-brain/types';
import { accountTypeLabel } from '../../../lib/display';
import { formatDate, formatMoney } from '../../../lib/format';
import { AccountDeleteButton } from './account-delete-button';

export function AccountsTable({
  direction,
  rows,
  sort,
}: {
  direction: 'asc' | 'desc';
  rows: Account[];
  sort: 'cash' | 'created' | 'currency' | 'name' | 'type';
}) {
  const sortHref = (
    column: 'cash' | 'created' | 'currency' | 'name' | 'type',
  ) => {
    const nextDirection =
      sort === column && direction === 'asc' ? 'desc' : 'asc';
    return `/accounts?sort=${column}&direction=${nextDirection}`;
  };

  const sortMarker = (
    column: 'cash' | 'created' | 'currency' | 'name' | 'type',
  ) => {
    if (sort !== column) {
      return '↕';
    }
    return direction === 'asc' ? '▲' : '▼';
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b border-border/70">
            {[
              ['name', 'Account'],
              ['type', 'Type'],
              ['currency', 'Currency'],
              ['cash', 'Cash EUR'],
              ['created', 'Created'],
            ].map(([key, label]) => (
              <th
                key={key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <a
                  href={sortHref(
                    key as 'cash' | 'created' | 'currency' | 'name' | 'type',
                  )}
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  {label}
                  <span className="text-[10px]" aria-hidden="true">
                    {sortMarker(
                      key as 'cash' | 'created' | 'currency' | 'name' | 'type',
                    )}
                  </span>
                </a>
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/50 transition-colors hover:bg-muted/35"
            >
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.name}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {accountTypeLabel(row.accountType)}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.currency}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.accountType === 'savings' ? (
                  <span className="sb-sensitive-value">
                    {formatMoney(row.currentCashBalanceEur)}
                  </span>
                ) : (
                  '-'
                )}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {formatDate(row.createdAt)}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                <AccountDeleteButton
                  accountId={row.id}
                  accountName={row.name}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
