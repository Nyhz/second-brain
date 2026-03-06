'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type Slice = {
  label: string;
  value: number;
  color?: string;
};

const MONOCHROME_OPACITIES = [0.92, 0.8, 0.68, 0.56, 0.44, 0.34, 0.26, 0.2];

export function AllocationDonutChart({ data }: { data: Slice[] }) {
  return (
    <div className="w-full px-4 pb-4">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={110}
            innerRadius={60}
            dataKey="value"
            nameKey="label"
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.label}
                fill={`hsl(var(--foreground) / ${
                  MONOCHROME_OPACITIES[index % MONOCHROME_OPACITIES.length] ?? 0.2
                })`}
                stroke="hsl(var(--background))"
                strokeWidth={1}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card) / 0.98)',
              border: '1px solid hsl(var(--border) / 0.8)',
              borderRadius: '8px',
              color: 'hsl(var(--foreground))',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
