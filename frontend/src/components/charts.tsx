'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useThemeMode } from '@/components/Providers';
import { colorScale } from '@/theme/antdTheme';

const load = (k: string) =>
  dynamic(() => import('@ant-design/charts').then((m) => (m as unknown as Record<string, React.ComponentType<Record<string, unknown>>>)[k]), { ssr: false });

/** Any @ant-design/charts component, lazily loaded (no SSR). Use with `useChartBase()`. */
export const ChartKit = {
  Line: load('Line'), Column: load('Column'), Bar: load('Bar'), Area: load('Area'), Pie: load('Pie'),
  Heatmap: load('Heatmap'), DualAxes: load('DualAxes'), Scatter: load('Scatter'), Radar: load('Radar'),
  Funnel: load('Funnel'), Gauge: load('Gauge'), Treemap: load('Treemap'), Waterfall: load('Waterfall'),
  Histogram: load('Histogram'), Sankey: load('Sankey'), Liquid: load('Liquid'), Bullet: load('Bullet'),
};

/** theme-aware base props: autoFit, height, transparent bg, legend on top, entrance animation */
export function useChartBase(height = 280) {
  const { mode } = useThemeMode();
  return useMemo(
    () => ({
      autoFit: true,
      height,
      theme: { type: mode === 'dark' ? 'classicDark' : 'classic', view: { viewFill: 'transparent' } },
      animate: { enter: { type: 'fadeIn', duration: 500 } },
      legend: { color: { position: 'top', layout: { justifyContent: 'flex-start' } } },
    }),
    [mode, height],
  );
}

type Row = Record<string, string | number | null | undefined>;

export interface ChartProps {
  data: Row[];
  x: string;
  y: string;
  /** field that splits the data into coloured series (city, platform, line …) */
  color?: string;
  height?: number;
  yTitle?: string;
  yMin?: number;
  yMax?: number;
  formatter?: (v: number) => string;
  /** @deprecated colours are always stable per series name now; kept so old calls compile */
  byCity?: boolean;
}

function useScale(data: Row[], color?: string, yMin?: number, yMax?: number) {
  return useMemo(() => {
    const s: Record<string, unknown> = {};
    if (color) {
      const domain = Array.from(new Set(data.map((d) => String(d[color]))));
      s.color = colorScale(domain);
    } else s.color = colorScale(['_']);
    if (yMin !== undefined || yMax !== undefined) s.y = { domainMin: yMin, domainMax: yMax };
    return s;
  }, [data, color, yMin, yMax]);
}

const xAxis = { labelAutoRotate: false, labelAutoHide: true };

export function LineChart({ data, x, y, color, height = 280, yTitle, yMin, yMax, formatter }: ChartProps) {
  const base = useChartBase(height);
  const scale = useScale(data, color, yMin, yMax);
  return <ChartKit.Line {...base} data={data} xField={x} yField={y} colorField={color} shapeField="smooth" point={{ sizeField: 3 }} scale={scale} axis={{ y: { title: yTitle, labelFormatter: formatter }, x: xAxis }} style={{ lineWidth: 2.5 }} />;
}

export function AreaChart({ data, x, y, color, height = 280, yMin, yMax, formatter, stack = false }: ChartProps & { stack?: boolean }) {
  const base = useChartBase(height);
  const scale = useScale(data, color, yMin, yMax);
  return <ChartKit.Area {...base} data={data} xField={x} yField={y} colorField={color} shapeField="smooth" stack={stack} style={{ fillOpacity: 0.22 }} line={{ style: { lineWidth: 2.5 } }} scale={scale} axis={{ y: { labelFormatter: formatter }, x: xAxis }} />;
}

/** grouped by default when `color` is set; pass stack for stacked columns */
export function ColumnChart({ data, x, y, color, height = 280, yMin, yMax, formatter, stack }: ChartProps & { stack?: boolean }) {
  const base = useChartBase(height);
  const scale = useScale(data, color, yMin, yMax);
  return <ChartKit.Column {...base} data={data} xField={x} yField={y} colorField={color} group={!!color && !stack} stack={!!stack} style={{ radiusTopLeft: 6, radiusTopRight: 6, maxWidth: 32 }} scale={scale} axis={{ y: { labelFormatter: formatter }, x: { labelAutoRotate: true } }} />;
}

export function BarChart({ data, x, y, color, height = 280, yMin, yMax, formatter, stack }: ChartProps & { stack?: boolean }) {
  const base = useChartBase(height);
  const scale = useScale(data, color, yMin, yMax);
  return <ChartKit.Bar {...base} data={data} xField={x} yField={y} colorField={color} group={!!color && !stack} stack={!!stack} style={{ radiusTopRight: 6, radiusBottomRight: 6, maxWidth: 18 }} scale={scale} axis={{ y: { labelFormatter: formatter } }} />;
}

export function DonutChart({ data, angle, color, height = 260 }: { data: Row[]; angle: string; color: string; height?: number }) {
  const base = useChartBase(height);
  const scale = useScale(data, color);
  return <ChartKit.Pie {...base} data={data} angleField={angle} colorField={color} innerRadius={0.68} scale={scale} label={{ text: (d: Row) => `${d[color]} · ${d[angle]}`, position: 'outside', style: { fontSize: 11 } }} legend={false} />;
}
