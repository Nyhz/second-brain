'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Point = {
  label: string;
  value: number;
};

export function AreaPerformanceChart({ data }: { data: Point[] }) {
  const yDomain = useMemo<[number, number]>(() => {
    const values = data
      .map((point) => point.value)
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) {
      return [0, 1];
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
      const basePadding = Math.max(Math.abs(min) * 0.1, 1);
      return [min - basePadding, max + basePadding];
    }

    const range = max - min;
    const padding = range * 0.1;
    return [min - padding, max + padding];
  }, [data]);

  return (
    <div className="w-full px-5 pb-5">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.38}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            strokeOpacity={0.45}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            domain={yDomain}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card) / 0.98)',
              border: '1px solid hsl(var(--border) / 0.7)',
              borderRadius: '8px',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            isAnimationActive={false}
            fill="url(#perfFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
