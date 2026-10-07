'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useThemeMode } from '@/components/Providers';
import { cityColor, palette, series } from '@/theme/antdTheme';

const Line = dynamic(() => import('@ant-design/charts').then((m) => m.Line), { ssr: false });
const Column = dynamic(() => import('@ant-design/charts').then((m) => m.Column), { ssr: false });
const Area = dynamic(() => import('@ant-design/charts').then((m) => m.Area), { ssr: false });
const Pie = dynamic(() => import('@ant-design/charts').then((m) => m.Pie), { ssr: false });
const Bar = dynamic(() => import('@ant-design/charts').then((m) => m.Bar), { ssr: false });

type Row = Record<string, string | number | null>;

function useBase(height: number) {
  const { mode } = useThemeMode();
  return useMemo(
    () => ({
      autoFit: true,
      height,
      theme: { type: mode === 'dark' ? 'classicDark' : 'classic', view: { viewFill: 'transparent' } },
      animate: { enter: { type: 'fadeIn', duration: 500 } },
      scale: { color: { range: series } },
      legend: { color: { position: 'top', layout: { justifyContent: 'flex-start' } } },
    }),
    [mode, height],
  );
}

const cityScale = { color: { domain: ['Delhi', 'Mumbai'], range: [cityColor.Delhi, cityColor.Mumbai] } };

interface Props {
  data: Row[];
  x: string;
  y: string;
  color?: string;
  height?: number;
  /** colour series by city (Delhi violet, Mumbai sunset) */
  byCity?: boolean;
  yTitle?: string;
  yMin?: number;
  yMax?: number;
  formatter?: (v: number) => string;
}

export function LineChart({ data, x, y, color, height = 280, byCity, yTitle, yMin, yMax, formatter }: Props) {
  const base = useBase(height);
  return (
    <Line
      {...base}
      data={data}
      xField={x}
      yField={y}
      colorField={color}
      shapeField="smooth"
      point={{ sizeField: 3 }}
      scale={{ ...base.scale, ...(byCity ? cityScale : {}), ...(yMin !== undefined || yMax !== undefined ? { y: { domainMin: yMin, domainMax: yMax } } : {}) }}
      axis={{ y: { title: yTitle, labelFormatter: formatter }, x: { labelAutoRotate: false, labelAutoHide: true } }}
      style={{ lineWidth: 2.5 }}
    />
  );
}

export function AreaChart({ data, x, y, color, height = 280, byCity, formatter }: Props) {
  const base = useBase(height);
  return (
    <Area
      {...base}
      data={data}
      xField={x}
      yField={y}
      colorField={color}
      shapeField="smooth"
      stack={false}
      style={{ fillOpacity: 0.22 }}
      line={{ style: { lineWidth: 2.5 } }}
      scale={{ ...base.scale, ...(byCity ? cityScale : {}) }}
      axis={{ y: { labelFormatter: formatter }, x: { labelAutoRotate: false, labelAutoHide: true } }}
    />
  );
}

export function ColumnChart({ data, x, y, color, height = 280, byCity, formatter }: Props & { stack?: boolean }) {
  const base = useBase(height);
  return (
    <Column
      {...base}
      data={data}
      xField={x}
      yField={y}
      colorField={color}
      group={!!color}
      style={{ radiusTopLeft: 6, radiusTopRight: 6, maxWidth: 28 }}
      scale={{ ...base.scale, ...(byCity ? cityScale : {}) }}
      axis={{ y: { labelFormatter: formatter }, x: { labelAutoRotate: true } }}
    />
  );
}

export function BarChart({ data, x, y, color, height = 280, byCity, formatter }: Props) {
  const base = useBase(height);
  return (
    <Bar
      {...base}
      data={data}
      xField={x}
      yField={y}
      colorField={color}
      group={!!color}
      style={{ radiusTopRight: 6, radiusBottomRight: 6, maxWidth: 18 }}
      scale={{ ...base.scale, ...(byCity ? cityScale : {}) }}
      axis={{ y: { labelFormatter: formatter } }}
    />
  );
}

export function DonutChart({ data, angle, color, height = 260 }: { data: Row[]; angle: string; color: string; height?: number }) {
  const base = useBase(height);
  const range = [palette.mint, palette.coral, palette.slate];
  return (
    <Pie
      {...base}
      data={data}
      angleField={angle}
      colorField={color}
      innerRadius={0.68}
      scale={{ color: { range } }}
      label={{ text: (d: Row) => `${d[color]} · ${d[angle]}`, position: 'outside', style: { fontSize: 11 } }}
      legend={false}
    />
  );
}
