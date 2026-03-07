'use client';

import { AreaPerformanceChart } from '../../ui/charts/area-performance-chart';

export function AccountProfilePerformanceChart({
  data,
}: {
  data: Array<{
    label: string;
    marketIndex: number;
    totalValue: number;
    dateIso?: string;
  }>;
}) {
  return <AreaPerformanceChart data={data} baselineValue={100} />;
}
