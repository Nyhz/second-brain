import type { ReactNode } from 'react';
import { Card } from './card';

type KpiCardProps = {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  subtext?: ReactNode;
};

export function KpiCard({ label, value, delta, subtext }: KpiCardProps) {
  return (
    <Card contentClassName="px-4 py-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {delta ? (
        <div className="mt-2 text-sm text-muted-foreground">{delta}</div>
      ) : null}
      {subtext ? (
        <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>
      ) : null}
    </Card>
  );
}
