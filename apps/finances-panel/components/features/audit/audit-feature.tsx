import type { FinanceAuditEvent } from '@second-brain/types';
import { Card } from '../../ui/card';
import { EmptyState } from '../../ui/states';

export function AuditFeature({
  rows,
}: {
  rows: FinanceAuditEvent[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit</h1>
        <p className="text-sm text-muted-foreground">
          Immutable event history for manual changes, imports, and derived
          finance records.
        </p>
      </div>

      <Card title="Recent Finance Events">
        {rows.length === 0 ? (
          <EmptyState message="No audit events recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Entity</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 align-top">
                    <td className="px-3 py-3 text-muted-foreground">
                      {new Date(row.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace('T', ' ')}{' '}
                      UTC
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{row.entityType}</div>
                      <div className="small">{row.entityId}</div>
                    </td>
                    <td className="px-3 py-3">{row.action}</td>
                    <td className="px-3 py-3">{row.source}</td>
                    <td className="px-3 py-3">{row.actorType}</td>
                    <td className="px-3 py-3">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
