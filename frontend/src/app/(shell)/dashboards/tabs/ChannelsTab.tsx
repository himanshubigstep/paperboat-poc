'use client';

import { useMemo } from 'react';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { BarChart, ChartKit, ColumnChart, useChartBase } from '@/components/charts';
import { Card, EstimateTag, Heat, PlatformTag, Prov, fmtINR, fmtNum } from '@/components/ui';
import { platformLabel } from '@/lib/config';
import { dashB } from '@/lib/api.dashboardB';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { availabilityStats, avg, discountPct, round1, sum } from '@/lib/metrics';
import { Gate, pctOf } from './partsB';

interface Row { platform: string; listings: number; skus: number; buyable: number; mrp: number; disc: number; sos: number; revenue: number; spend: number; roas: number; cpu: number; gap: number }

function MediaChart({ data }: { data: { platform: string; spend: number; roas: number }[] }) {
  const base = useChartBase(280);
  return (
    <ChartKit.DualAxes {...base} xField="platform" data={data}
      children={[
        { type: 'interval', yField: 'spend', style: { maxWidth: 32, radiusTopLeft: 6, radiusTopRight: 6 }, axis: { y: { title: 'Spend (₹ L, 30 d)' } } },
        { type: 'line', yField: 'roas', shapeField: 'smooth', style: { lineWidth: 2.5 }, axis: { y: { position: 'right', title: 'ROAS (×)' } }, scale: { y: { independent: true } } },
      ]} />
  );
}
function CoverChart({ data }: { data: { platform: string; listings: number; buyable: number; skus: number }[] }) {
  const base = useChartBase(280);
  return <ChartKit.Scatter {...base} data={data} xField="listings" yField="buyable" sizeField="skus" colorField="platform" shapeField="point" scale={{ size: { range: [12, 40] } }} axis={{ x: { title: 'Listings observed' }, y: { title: 'Buyable %' } }} />;
}

export default function ChannelsTab() {
  const { platforms, cities } = useFilters();
  const d = useDataset();
  const ads = useQuery({ queryKey: ['dashB', 'ads', platforms], queryFn: () => dashB.ads(platforms) });
  const search = useQuery({ queryKey: ['dashB', 'search', platforms, cities], queryFn: () => dashB.search(platforms, cities) });
  const sla = useQuery({ queryKey: ['dashB', 'sla', platforms, cities], queryFn: () => dashB.sla(platforms, cities) });

  const rows = useMemo<Row[]>(() => {
    return platforms.map((p) => {
      const rs = d.latest.filter((s) => s.platform === p);
      const st = availabilityStats(rs);
      const listed = rs.filter((r) => r.availability !== 'not_listed');
      const priced = listed.filter((r) => r.mrp);
      const ad = ads.data?.find((a) => a.platform === p);
      const sr = (search.data ?? []).filter((r) => r.platform === p && (r.type === 'category' || r.type === 'occasion'));
      const spend = ad?.spend_l ?? 0;
      return {
        platform: p, listings: st.listed, skus: new Set(listed.map((r) => r.product_id)).size, buyable: st.buyablePct,
        mrp: round1(avg(priced.map((r) => r.mrp as number))), disc: round1(avg(priced.map((r) => discountPct(r.mrp, r.selling_price)))),
        sos: pctOf(sum(sr.map((r) => r.pb)), sum(sr.map((r) => r.total))),
        revenue: sum(d.intervals.filter((i) => i.platform === p).map((i) => i.revenue)),
        spend, roas: ad?.roas ?? 0, cpu: ad?.cpu ?? 0,
        gap: round1(spend * (1 - st.buyablePct / 100)),
      };
    });
  }, [d.latest, d.intervals, platforms, ads.data, search.data]);

  const slaPlat = useMemo(() => platforms.map((p) => { const v = (sla.data ?? []).filter((s) => s.platform === p).map((s) => s.minutes); return { platform: platformLabel(p), minutes: round1(avg(v)) }; }), [platforms, sla.data]);
  const media = rows.map((r) => ({ platform: platformLabel(r.platform), spend: r.spend, roas: r.roas }));
  const guard = rows.flatMap((r) => [
    { platform: platformLabel(r.platform), kind: 'Spend on buyable listings', value: round1(r.spend - r.gap) },
    { platform: platformLabel(r.platform), kind: 'Spend on non-buyable listings', value: r.gap },
  ]);
  const spendTot = sum(rows.map((r) => r.spend));
  const gapTot = round1(sum(rows.map((r) => r.gap)));
  const real = <Prov>Shelf capture</Prov>;
  const sample = <Prov kind="sample">Sample data</Prov>;

  const cols: ColumnsType<Row> = [
    { title: 'Platform', dataIndex: 'platform', fixed: 'left', render: (p: string) => <PlatformTag id={p} /> },
    { title: 'Listings', dataIndex: 'listings', align: 'right' },
    { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (v: number) => <Heat v={v} /> },
    { title: 'Avg MRP', dataIndex: 'mrp', align: 'right', render: (v: number) => fmtINR(v) },
    { title: 'Avg discount', dataIndex: 'disc', align: 'right', render: (v: number) => `${v}%` },
    { title: 'Share of search', dataIndex: 'sos', align: 'right', render: (v: number) => <>{v}% <Tag bordered={false}>sample</Tag></> },
    { title: <>Revenue (window) <EstimateTag /></>, dataIndex: 'revenue', align: 'right', render: (v: number) => fmtINR(Math.round(v)) },
    { title: 'Spend 30d', dataIndex: 'spend', align: 'right', render: (v: number) => <>₹{v} L <Tag bordered={false}>sample</Tag></> },
    { title: 'ROAS', dataIndex: 'roas', align: 'right', render: (v: number) => <Tag color={v >= 3.5 ? 'success' : v >= 2.5 ? 'warning' : 'error'} bordered={false}>{v}×</Tag> },
    { title: 'Cost / unit', dataIndex: 'cpu', align: 'right', render: (v: number) => `₹${v}` },
  ];
  void fmtNum;

  return (
    <Gate loading={d.isLoading || ads.isLoading} error={d.isError || ads.isError} onRetry={() => { d.refetch(); ads.refetch(); }} empty={!rows.length || !d.latest.length}>
      <div className="bento">
        <Card className="span-12" title="Channel scorecard" sub="Per platform: listings, availability, price, search, media" footer={<>{real}{sample}</>}>
          <Table<Row> size="small" rowKey="platform" pagination={false} columns={cols} dataSource={rows} scroll={{ x: 'max-content' }} />
        </Card>
        <Card className="span-6" title="Media spend and return" sub="Last 30 days · bars = spend, line = ROAS" footer={sample}>
          <MediaChart data={media} />
        </Card>
        <Card className="span-6" title="Spend on listings with weak availability" sub="Availability-aware media guard"
          footer={<span>₹{gapTot} L of ₹{round1(spendTot)} L monthly spend sits on listings that are not buyable (spend × real non-buyable share). {sample}</span>}>
          <ColumnChart data={guard} x="platform" y="value" color="kind" stack height={280} formatter={(v) => `₹${v} L`} />
        </Card>
        <Card className="span-6" title="How fast each platform promises to deliver" sub="Average minutes stated on the listing at capture" footer={sample}>
          <BarChart data={slaPlat} x="platform" y="minutes" color="platform" height={280} formatter={(v) => `${v} min`} />
        </Card>
        <Card className="span-6" title="Listings, depth and shelf presence" sub="Bubble size is the number of distinct Paper Boat SKUs observed on that platform" footer={real}>
          <CoverChart data={rows.map((r) => ({ platform: platformLabel(r.platform), listings: r.listings, buyable: r.buyable, skus: r.skus }))} />
        </Card>
      </div>
    </Gate>
  );
}
