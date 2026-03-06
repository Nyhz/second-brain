'use client';

import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from 'recharts';

type SparklinePoint = {
  value: number;
};

export function Sparkline({
  data,
  color = 'hsl(var(--primary))',
  baseline = 100,
  width = 130,
  height = 40,
}: {
  data: SparklinePoint[];
  color?: string;
  baseline?: number;
  width?: number | string;
  height?: number;
}) {
  const gradientId = `sparkline-${useId().replace(/:/g, '')}`;
  const domain = useMemo<[number, number]>(() => {
    const values = data
      .map((point) => point.value)
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) {
      return [0, 1];
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.01, 0.1);
      return [min - pad, max + pad];
    }
    const spread = max - min;
    const pad = Math.max(spread * 0.08, 0.1);
    return [min - pad, max + pad];
  }, [data]);

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <ReferenceLine
            y={baseline}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.4}
            strokeDasharray="3 3"
          />
          <YAxis hide domain={domain} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
