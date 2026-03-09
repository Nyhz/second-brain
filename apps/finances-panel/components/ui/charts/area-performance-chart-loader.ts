import type { ComponentType } from 'react';

type AreaPerformanceChartModule = typeof import('./area-performance-chart');

export const loadAreaPerformanceChart = () =>
  import('./area-performance-chart').then(
    (module: AreaPerformanceChartModule) => ({
      default: module.AreaPerformanceChart,
    }),
  );

export type AreaPerformanceChartComponent =
  ComponentType<AreaPerformanceChartModule['AreaPerformanceChart'] extends ComponentType<
    infer Props
  >
    ? Props
    : never>;
