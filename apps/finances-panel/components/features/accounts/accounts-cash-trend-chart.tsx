'use client';

import { PriceLineChart } from '../../ui/charts/price-line-chart';

export function AccountsCashTrendChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  return <PriceLineChart data={data} />;
}
