'use client';

import { Line, LineChart, ResponsiveContainer } from 'recharts';

type SparklinePoint = {
  value: number;
};

export function Sparkline({
  data,
  color = 'hsl(var(--primary))',
}: {
  data: SparklinePoint[];
  color?: string;
}) {
  return (
    <div style={{ width: 120, height: 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
