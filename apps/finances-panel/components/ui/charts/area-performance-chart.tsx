'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';

type Point = {
  label: string;
  marketIndex: number;
  totalValue: number;
  dateIso?: string;
};
const RETURN_PCT_MIN_BASELINE_EUR = 1;
const CHART_EDGE_PADDING_RATIO = 0.02;
const MIN_CHART_EDGE_PADDING = 0.05;

export function AreaPerformanceChart({
  data,
  baselineValue,
}: {
  data: Point[];
  baselineValue?: number | null;
}) {
  const baseline =
    typeof baselineValue === 'number' && Number.isFinite(baselineValue)
      ? baselineValue
      : undefined;
  const effectiveBaseline =
    baseline ??
    data.find((point) => Number.isFinite(point.marketIndex))?.marketIndex ??
    undefined;
  const tooltipPctDenominator = useMemo(() => {
    if (
      effectiveBaseline !== undefined &&
      Number.isFinite(effectiveBaseline) &&
      Math.abs(effectiveBaseline) >= RETURN_PCT_MIN_BASELINE_EUR
    ) {
      return Math.abs(effectiveBaseline);
    }
    const firstMeaningful = data.find(
      (point) =>
        Number.isFinite(point.marketIndex) &&
        Math.abs(point.marketIndex) >= RETURN_PCT_MIN_BASELINE_EUR,
    )?.marketIndex;
    return firstMeaningful !== undefined ? Math.abs(firstMeaningful) : undefined;
  }, [data, effectiveBaseline]);
  const niceStep = (rawStep: number) => {
    if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
    const exponent = Math.floor(Math.log10(rawStep));
    const fraction = rawStep / 10 ** exponent;
    let niceFraction = 1;
    if (fraction <= 1) {
      niceFraction = 1;
    } else if (fraction <= 2) {
      niceFraction = 2;
    } else if (fraction <= 5) {
      niceFraction = 5;
    } else {
      niceFraction = 10;
    }
    return niceFraction * 10 ** exponent;
  };

  const yAxis = useMemo<{ domain: [number, number]; ticks: number[] }>(() => {
    const values = data
      .map((point) => point.marketIndex)
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) {
      return { domain: [0, 1], ticks: [0, 1] };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    let minBound = min;
    let maxBound = max;
    if (min === max) {
      const basePadding = Math.max(Math.abs(min) * 0.0025, MIN_CHART_EDGE_PADDING);
      minBound = min - basePadding;
      maxBound = max + basePadding;
    } else {
      const spread = max - min;
      const edgePadding = Math.max(
        spread * CHART_EDGE_PADDING_RATIO,
        MIN_CHART_EDGE_PADDING,
      );
      minBound = min - edgePadding;
      maxBound = max + edgePadding;
    }

    const visibleRange = Math.max(maxBound - minBound, 1e-6);
    const step = niceStep(visibleRange / 5);
    const firstTick = Math.ceil(minBound / step) * step;
    const lastTick = Math.floor(maxBound / step) * step;
    const ticks: number[] = [];
    if (firstTick <= lastTick) {
      for (let value = firstTick; value <= lastTick + step * 0.01; value += step) {
        ticks.push(value);
      }
    }
    if (ticks.length < 2) {
      ticks.push(Math.round(minBound), Math.round(maxBound));
    }

    return { domain: [minBound, maxBound], ticks };
  }, [data]);

  const formatYAxisTick = (value: number) =>
    effectiveBaseline !== undefined && Number.isFinite(effectiveBaseline)
      ? `${Math.round(value - effectiveBaseline)}%`
      : `${Math.round(value)}%`;

  const formatTooltipDate = (dateIso?: string, fallbackLabel?: string) => {
    if (typeof dateIso === 'string' && dateIso.length >= 10) {
      const [year, month, day] = dateIso.slice(0, 10).split('-');
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
    }
    return fallbackLabel ?? '';
  };

  const formatTooltipMoney = (value: number) =>
    `${Math.round(value).toLocaleString('es-ES')}€`;

  const formatTooltipPercent = (value: number) => {
    if (
      effectiveBaseline === undefined ||
      !Number.isFinite(effectiveBaseline) ||
      tooltipPctDenominator === undefined ||
      !Number.isFinite(tooltipPctDenominator) ||
      tooltipPctDenominator < 1e-9
    ) {
      return '+0,00%';
    }
    const percent =
      ((value - effectiveBaseline) / tooltipPctDenominator) * 100;
    const formatted = percent.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${percent >= 0 ? '+' : ''}${formatted}%`;
  };

  const renderTooltip = (props: TooltipProps<number, string>) => {
    const { active, payload } = props;
    if (!active || !payload || payload.length === 0) return null;
    const pointPayload = payload[0];
    const point = pointPayload?.payload as Point | undefined;
    const marketIndex =
      typeof pointPayload?.value === 'number'
        ? pointPayload.value
        : Number.NaN;
    if (!point || !Number.isFinite(marketIndex)) return null;

    return (
      <div className="rounded-md border border-border/70 bg-card/95 px-3 py-2 shadow-sm">
        <p className="text-xs text-muted-foreground">
          {formatTooltipDate(point.dateIso, point.label)}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {formatTooltipMoney(point.totalValue)}
        </p>
        <p className="text-xs text-muted-foreground">
          ({formatTooltipPercent(marketIndex)})
        </p>
      </div>
    );
  };

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
          {baseline !== undefined ? (
            <ReferenceLine
              y={baseline}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.55}
              strokeDasharray="4 4"
            />
          ) : null}
          <XAxis
            dataKey="label"
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
            tickFormatter={formatYAxisTick}
          />
          <Tooltip content={renderTooltip} />
          <Area
            type="monotone"
            dataKey="marketIndex"
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
