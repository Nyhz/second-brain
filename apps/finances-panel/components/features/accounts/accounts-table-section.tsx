import type { Account } from '@second-brain/types';
import { Card } from '../../ui/card';
import { EmptyState } from '../../ui/states';
import { AccountsTable } from './accounts-table';

export function AccountsTableSection({
  direction,
  rows,
  sort,
}: {
  direction: 'asc' | 'desc';
  rows: Account[];
  sort: 'cash' | 'created' | 'currency' | 'name' | 'type';
}) {
  return (
    <Card title="Accounts Table">
      {rows.length === 0 ? (
        <EmptyState message="No accounts yet." />
      ) : (
        <AccountsTable direction={direction} rows={rows} sort={sort} />
      )}
    </Card>
  );
}
