import { Card } from './Card';

type KpiCardProps = {
  label: string;
  value: string;
  delta?: string;
};

export function KpiCard({ label, value, delta }: KpiCardProps) {
  return (
    <Card className="sb-ui-kpi-card">
      <div className="sb-ui-kpi-label">{label}</div>
      <div className="sb-ui-kpi-value">{value}</div>
      {delta ? <div className="sb-ui-kpi-delta">{delta}</div> : null}
    </Card>
  );
}
