'use client';

import { useEffect } from 'react';
import { loadAreaPerformanceChart } from './ui/charts/area-performance-chart-loader';

export function OverviewChartPreloader() {
  useEffect(() => {
    let cancelled = false;

    const preload = () => {
      if (cancelled) return;
      void loadAreaPerformanceChart();
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(preload, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(preload, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
