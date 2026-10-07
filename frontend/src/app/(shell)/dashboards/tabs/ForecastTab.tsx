'use client';

import { useMemo } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { AimOutlined, CalendarOutlined, LineChartOutlined, RiseOutlined } from '@ant-design/icons';
import { BarChart, LineChart } from '@/components/charts';
import { Card, Delta, Kpi, Prov, fmtDay, fmtNum } from '@/components/ui';
import { dashB } from '@/lib/api.dashboardB';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { istDay } from '@/lib/metrics';
import { Gate, linesOf } from './partsB';

type TRow = { line: string; byCity: Record<string, number>; total: number; growth: number };

export default function ForecastTab() {
  const { platforms, cities } = useFilters();
  const d = useDataset();
  const lines = useMemo(() => linesOf(d.latest).map((l) => l.line), [d.latest]);
  const day = d.meta ? istDay(d.meta.captured_at) : '';
  const q = useQuery({ queryKey: ['dashB', 'forecast', platforms, cities, lines, day], queryFn: () => dashB.forecast(platforms, cities, lines, day), enabled: !!day });
  const f = q.data;

  const series = useMemo(() => {
    if (!f) return [];
    return f.weeks.flatMap((w) => {
      const date = fmtDay(w.week);
      const out: { week: string; value: number; series: string }[] = [];
      if (w.actual !== undefined) out.push({ week: date, value: w.actual, series: 'Actual' });
      if (w.p50 !== undefined) out.push({ week: date, value: w.p50, series: 'Forecast (P50)' }, { week: date, value: w.p10 as number, series: 'P10' }, { week: date, value: w.p90 as number, series: 'P90' });
      return out;
    });
  }, [f]);

  const cols: ColumnsType<TRow> = [
    { title: 'Product line', dataIndex: 'line', render: (l: string) => <b>{l}</b> },
    ...cities.map((c) => ({ title: c, key: c, align: 'right' as const, render: (_: unknown, r: TRow) => fmtNum(r.byCity[c] ?? 0) })),
    { title: 'Total next 4 wk', dataIndex: 'total', align: 'right', sorter: (a, b) => a.total - b.total, defaultSortOrder: 'descend', render: (v: number) => <b>{fmtNum(v)}</b> },
    { title: 'vs last 4 wk', dataIndex: 'growth', align: 'right', render: (v: number) => <Delta v={v} suffix="%" /> },
  ];
  const sample = <Prov kind="sample">Sample data</Prov>;
  const growth = f && f.last4 ? Math.round(((f.next4 - f.last4) / f.last4) * 1000) / 10 : 0;
  const peak = f?.weeks.filter((w) => w.p50 !== undefined).reduce((a, b) => ((a.p50 ?? 0) >= (b.p50 ?? 0) ? a : b));

  return (
    <Gate loading={d.isLoading || q.isLoading} error={d.isError || q.isError} onRetry={() => { d.refetch(); q.refetch(); }} empty={!f || !d.latest.length}>
      {f && (
        <div className="bento">
          <Kpi className="span-3" label="Next 4 weeks" value={fmtNum(f.next4)} icon={<RiseOutlined />} delta={`${Math.abs(growth)}%`} up={growth >= 0} note="vs last 4 wk · units" />
          <Kpi className="span-3" label="Next 8 weeks" value={fmtNum(f.next8)} icon={<CalendarOutlined />} note="80% interval ±7–12%" />
          <Kpi className="span-3" label="Forecast accuracy (WAPE)" value={`${f.accuracy.wape}%`} icon={<AimOutlined />} note={`baseline ${f.accuracy.baseline}%`} />
          <Kpi className="span-3" label="Peak week" value={peak ? fmtDay(peak.week) : '—'} icon={<LineChartOutlined />} note={`bias ${f.accuracy.bias}%`} />

          <Card className="span-8" title="Demand forecast" sub="Weekly units, next 8 weeks with 80% interval (P10–P90)" footer={sample}>
            <LineChart data={series} x="week" y="value" color="series" height={340} formatter={(v) => `${Math.round(v / 1000)}k`} />
          </Card>
          <Card className="span-4" title="Forecast drivers" sub="Contribution to next-4-week change" footer={sample}>
            <BarChart data={f.drivers} x="driver" y="impact" height={340} formatter={(v) => `${v}%`} />
          </Card>
          <Card className="span-12" title="Forecast by product line and city" sub="Next 4 weeks vs last 4 weeks · lines from the live capture" footer={sample}>
            <Table<TRow> size="small" rowKey="line" pagination={false} columns={cols} dataSource={f.table} scroll={{ x: 'max-content' }} />
          </Card>
        </div>
      )}
    </Gate>
  );
}
