import { Card } from './Card';

type KpiCardProps = {
  label: string;
  value: string;
  delta?: string;
};

export function KpiCard({ label, value, delta }: KpiCardProps) {
  return (
    <Card className="px-4 py-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {delta ? <div className="mt-2 text-sm text-muted-foreground">{delta}</div> : null}
    </Card>
  );
}
