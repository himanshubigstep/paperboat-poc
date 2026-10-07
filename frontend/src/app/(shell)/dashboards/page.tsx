'use client';

import { Progress, Segmented, Table, Tabs, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { BarChart, ColumnChart, DonutChart, LineChart } from '@/components/charts';
import { AvailTag, Card, CityTag, DataWarning, ErrorState, EstimateTag, Heat, PageHead, Prov, SkeletonBlock, fmtDay, fmtINR, fmtNum } from '@/components/ui';
import { lastDays, useFilters } from '@/hooks/useFilters';
import { api } from '@/lib/api';
import type { City } from '@/lib/types';

const TABS = ['overview', 'availability', 'price', 'search', 'cities'] as const;
type Tab = (typeof TABS)[number];

export default function Dashboards() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as Tab) : 'overview';
  const quality = useQuery({ queryKey: ['quality'], queryFn: api.quality });
  const onTab = (k: string) => {
    const n = new URLSearchParams(sp.toString());
    n.set('tab', k);
    router.replace(`${pathname}?${n}`, { scroll: false });
  };
  return (
    <>
      <PageHead title="Dashboards" sub="Blinkit · availability, price, search rank and city comparison" />
      <DataWarning issues={quality.data?.length ?? 0} />
      <Tabs
        activeKey={tab}
        onChange={onTab}
        items={[
          { key: 'overview', label: 'Overview', children: <OverviewTab /> },
          { key: 'availability', label: 'Availability & sell-out', children: <AvailabilityTab /> },
          { key: 'price', label: 'Price & discount', children: <PriceTab /> },
          { key: 'search', label: 'Search & rank', children: <SearchTab /> },
          { key: 'cities', label: 'City comparison', children: <CitiesTab /> },
        ]}
      />
    </>
  );
}

function OverviewTab() {
  const { city, range } = useFilters();
  const av = useQuery({ queryKey: ['availability', city], queryFn: () => api.availability(city) });
  const pr = useQuery({ queryKey: ['price', city], queryFn: () => api.price(city) });
  const se = useQuery({ queryKey: ['search', city], queryFn: () => api.search(city) });
  if (av.isError) return <ErrorState onRetry={() => av.refetch()} />;
  const donut = (c: City) => {
    const s = av.data!.states[c];
    return [{ state: 'Buyable', n: s.available }, { state: 'Out of stock', n: s.out_of_stock }, { state: 'Not listed', n: s.not_listed }];
  };
  const cities: City[] = city === 'Both' ? ['Delhi', 'Mumbai'] : [city];
  return (
    <div className="bento">
      {cities.map((c) => (
        <Card key={c} className={cities.length === 1 ? 'span-6' : 'span-3'} title={`${c} · listing states`} sub="Every priority listing, by state" footer={<Prov>{av.data?.states[c].pct}% buyable</Prov>}>
          {av.isLoading ? <SkeletonBlock h={220} /> : <DonutChart data={donut(c)} angle="n" color="state" height={220} />}
        </Card>
      ))}
      <Card className={cities.length === 1 ? 'span-6' : 'span-6'} title="Average discount" sub="Percent below MRP, daily">
        {pr.isLoading ? <SkeletonBlock h={220} /> : <LineChart height={220} data={lastDays(pr.data!.trend, range).map((p) => ({ date: fmtDay(p.date), city: p.city, value: p.avg_discount }))} x="date" y="value" color="city" byCity formatter={(v) => `${v}%`} />}
      </Card>
      <Card className="span-6" title="Best search rank (brand keywords)" sub="Lower is better">
        {se.isLoading ? <SkeletonBlock h={240} /> : <LineChart height={240} data={lastDays(se.data!.trend, range).map((p) => ({ date: fmtDay(p.date), city: p.city, value: p.value }))} x="date" y="value" color="city" byCity />}
      </Card>
      <Card className="span-6" title="Share of search" sub="Paper Boat share of the top-10 slots, by keyword">
        {se.isLoading ? <SkeletonBlock h={240} /> : <BarChart height={240} data={se.data!.sos.map((k) => ({ keyword: k.keyword, share: k.share }))} x="keyword" y="share" formatter={(v) => `${v}%`} />}
      </Card>
    </div>
  );
}

function AvailabilityTab() {
  const { city, range } = useFilters();
  const [metric, setMetric] = useState<'units' | 'revenue'>('units');
  const av = useQuery({ queryKey: ['availability', city], queryFn: () => api.availability(city) });
  const se = useQuery({ queryKey: ['sellout', city], queryFn: () => api.sellout(city) });
  if (av.isError) return <ErrorState onRetry={() => av.refetch()} />;
  const cities: City[] = city === 'Both' ? ['Delhi', 'Mumbai'] : [city];
  return (
    <div className="bento">
      <Card className="span-6" title="Buyable availability" sub="Share of priority products buyable, per day">
        {av.isLoading ? <SkeletonBlock /> : <LineChart yMin={70} yMax={100} data={lastDays(av.data!.trend, range).map((p) => ({ ...p, date: fmtDay(p.date) }))} x="date" y="value" color="city" byCity formatter={(v) => `${v}%`} />}
      </Card>
      <Card className="span-6" title={<span>Estimated sell-out <EstimateTag /></span>} sub="Units moved between captures, restocks excluded" actions={<Segmented size="small" value={metric} onChange={(v) => setMetric(v as 'units' | 'revenue')} options={[{ label: 'Units', value: 'units' }, { label: 'Revenue', value: 'revenue' }]} />}>
        {se.isLoading ? <SkeletonBlock /> : <LineChart data={lastDays(metric === 'units' ? se.data!.units : se.data!.revenue, range).map((p) => ({ ...p, date: fmtDay(p.date) }))} x="date" y="value" color="city" byCity formatter={(v) => (metric === 'revenue' ? `₹${Math.round(v / 1000)}k` : String(v))} />}
      </Card>
      {cities.map((c) => (
        <Card key={c} className="span-12" title={`${c} · availability by dark store`} sub="Heat = share of captures this product was buyable at that store" footer={<Prov>Red = repeated stock-out</Prov>}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'separate', borderSpacing: 4 }}>
              <thead>
                <tr><th style={{ textAlign: 'left', fontSize: 12 }} className="muted">Product</th>{av.data?.matrix[c].areas.map((a) => <th key={a} className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>{a}</th>)}</tr>
              </thead>
              <tbody>
                {av.data?.matrix[c].rows.map((r) => (
                  <tr key={r.product}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap', paddingRight: 8 }}>{r.product}</td>
                    {r.cells.map((v, i) => <td key={i}><Heat v={v} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <Card className="span-12" title="Not buyable right now" sub="Out of stock and not-listed products are different problems">
        <Table
          size="small"
          rowKey={(r) => r.product_id + r.city}
          loading={av.isLoading}
          pagination={false}
          dataSource={av.data?.oos}
          columns={[
            { title: 'Product', dataIndex: 'name', render: (v, r) => `${v} · ${r.pack_size}` },
            { title: 'City', dataIndex: 'city', render: (c) => <CityTag city={c} /> },
            { title: 'State', dataIndex: 'state', render: (s) => <AvailTag v={s} /> },
            { title: 'Out for', dataIndex: 'since' },
          ]}
        />
      </Card>
    </div>
  );
}

function PriceTab() {
  const { city, range } = useFilters();
  const pr = useQuery({ queryKey: ['price', city], queryFn: () => api.price(city) });
  if (pr.isError) return <ErrorState onRetry={() => pr.refetch()} />;
  const bands = pr.data?.bands;
  const bandRows = bands ? bands.bands.flatMap((b, i) => (['Delhi', 'Mumbai'] as City[]).filter((c) => city === 'Both' || c === city).map((c) => ({ band: b, city: c, listings: bands[c][i] }))) : [];
  return (
    <div className="bento">
      <Card className="span-6" title="Average selling price" sub="₹, daily, across priority products">
        {pr.isLoading ? <SkeletonBlock /> : <LineChart data={lastDays(pr.data!.trend, range).map((p) => ({ date: fmtDay(p.date), city: p.city, value: p.avg_price }))} x="date" y="value" color="city" byCity formatter={(v) => `₹${v}`} />}
      </Card>
      <Card className="span-6" title="Discount depth" sub="% below MRP, daily">
        {pr.isLoading ? <SkeletonBlock /> : <LineChart data={lastDays(pr.data!.trend, range).map((p) => ({ date: fmtDay(p.date), city: p.city, value: p.avg_discount }))} x="date" y="value" color="city" byCity formatter={(v) => `${v}%`} />}
      </Card>
      <Card className="span-5" title="Discount bands" sub="Number of listings in each band">
        {pr.isLoading ? <SkeletonBlock /> : <ColumnChart data={bandRows} x="band" y="listings" color="city" byCity />}
      </Card>
      <Card className="span-7" title="Price by city" sub="Same pack, different shelf — gaps above 5% are flagged">
        <Table
          size="small"
          rowKey="product"
          loading={pr.isLoading}
          pagination={false}
          dataSource={pr.data?.dispersion}
          columns={[
            { title: 'Product', dataIndex: 'product' },
            { title: 'Delhi', dataIndex: 'Delhi', align: 'right', render: fmtINR },
            { title: 'Mumbai', dataIndex: 'Mumbai', align: 'right', render: fmtINR },
            { title: 'Gap', dataIndex: 'gap_pct', align: 'right', sorter: (a, b) => a.gap_pct - b.gap_pct, render: (v: number) => <Tag bordered={false} color={Math.abs(v) > 5 ? 'orange' : 'default'}>{v > 0 ? '+' : ''}{v}%</Tag> },
          ]}
        />
      </Card>
    </div>
  );
}

function SearchTab() {
  const { city, range } = useFilters();
  const se = useQuery({ queryKey: ['search', city], queryFn: () => api.search(city) });
  if (se.isError) return <ErrorState onRetry={() => se.refetch()} />;
  const move = (r: { rank: number; prev_rank: number }) =>
    r.rank < r.prev_rank ? <span className="delta-up"><ArrowUpOutlined /> {r.prev_rank - r.rank}</span> : r.rank > r.prev_rank ? <span className="delta-down"><ArrowDownOutlined /> {r.rank - r.prev_rank}</span> : <span className="muted"><MinusOutlined /></span>;
  return (
    <div className="bento">
      <Card className="span-5" title="Share of search" sub="Paper Boat share of results, by keyword">
        {se.isLoading ? <SkeletonBlock h={320} /> : <BarChart height={320} data={se.data!.sos.map((k) => ({ keyword: k.keyword, share: k.share }))} x="keyword" y="share" formatter={(v) => `${v}%`} />}
      </Card>
      <Card className="span-7" title="Keyword ranking" sub="Best Paper Boat position per keyword; paid-or-earned marker" footer={<Prov>Sponsored = a paid slot at that position</Prov>}>
        <Table
          size="small"
          rowKey="key"
          loading={se.isLoading}
          pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
          dataSource={se.data?.ranks}
          columns={[
            { title: 'Keyword', dataIndex: 'keyword', sorter: (a, b) => a.keyword.localeCompare(b.keyword) },
            { title: 'City', dataIndex: 'city', render: (c) => <CityTag city={c} />, filters: [{ text: 'Delhi', value: 'Delhi' }, { text: 'Mumbai', value: 'Mumbai' }], onFilter: (v, r) => r.city === v },
            { title: 'Rank', dataIndex: 'rank', align: 'right', sorter: (a, b) => a.rank - b.rank, render: (v) => <b>#{v}</b> },
            { title: 'Move', align: 'right', render: (_, r) => move(r) },
            { title: 'Slot', dataIndex: 'is_sponsored', render: (v) => <Tag bordered={false} color={v ? 'magenta' : 'green'}>{v ? 'Paid' : 'Organic'}</Tag> },
            { title: 'Share', dataIndex: 'share', align: 'right', sorter: (a, b) => a.share - b.share, render: (v) => `${v}%` },
          ]}
        />
      </Card>
      <Card className="span-12" title="Best rank over time" sub="Average best position on brand keywords (lower is better)">
        {se.isLoading ? <SkeletonBlock /> : <LineChart data={lastDays(se.data!.trend, range).map((p) => ({ date: fmtDay(p.date), city: p.city, value: p.value }))} x="date" y="value" color="city" byCity />}
      </Card>
    </div>
  );
}

function CitiesTab() {
  const cmp = useQuery({ queryKey: ['compare'], queryFn: api.compare });
  if (cmp.isError) return <ErrorState onRetry={() => cmp.refetch()} />;
  const d = cmp.data?.[0];
  const m = cmp.data?.[1];
  const rows = d && m ? [
    { label: 'Dark stores observed', a: d.stores, b: m.stores, fmt: fmtNum, higher: true },
    { label: 'Priority products listed', a: d.listed, b: m.listed, fmt: fmtNum, higher: true },
    { label: 'Buyable', a: d.availability_pct, b: m.availability_pct, fmt: (v: number) => `${v}%`, higher: true },
    { label: 'Average selling price', a: d.avg_price, b: m.avg_price, fmt: fmtINR, higher: false },
    { label: 'Average discount', a: d.avg_discount, b: m.avg_discount, fmt: (v: number) => `${v}%`, higher: true },
    { label: 'Average best rank', a: d.avg_rank, b: m.avg_rank, fmt: (v: number) => `#${v}`, higher: false },
    { label: 'Brand share of search', a: d.sos_brand, b: m.sos_brand, fmt: (v: number) => `${v}%`, higher: true },
    { label: 'Est. units · 7 d', a: d.est_units_7d, b: m.est_units_7d, fmt: fmtNum, higher: true },
  ] : [];
  return (
    <div className="bento">
      <Card className="span-8" title="Delhi vs Mumbai" sub="The two cities side by side on the same measures" footer={<Prov>Where the gap is widest is where action is needed</Prov>}>
        <Table
          size="middle"
          rowKey="label"
          loading={cmp.isLoading}
          pagination={false}
          dataSource={rows}
          columns={[
            { title: 'Measure', dataIndex: 'label' },
            { title: 'Delhi', align: 'right', render: (_, r) => <b className="tnum">{r.fmt(r.a)}</b> },
            { title: 'Mumbai', align: 'right', render: (_, r) => <b className="tnum">{r.fmt(r.b)}</b> },
            { title: 'Leads', render: (_, r) => { const lead = r.a === r.b ? '—' : (r.a > r.b) === r.higher ? 'Delhi' : 'Mumbai'; return lead === '—' ? '—' : <CityTag city={lead as City} />; } },
          ]}
        />
      </Card>
      <Card className="span-4" title="Buyable by city" sub="Priority products you can buy now">
        <div style={{ display: 'grid', gap: 22, padding: '8px 0' }}>
          {cmp.data?.map((c) => (
            <div key={c.city}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><b>{c.city}</b><span className="tnum">{c.availability_pct}%</span></div>
              <Progress percent={c.availability_pct} showInfo={false} strokeColor={c.city === 'Delhi' ? '#7C5CFF' : '#FF9F43'} trailColor="rgba(128,128,160,0.18)" strokeWidth={12} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="span-12" title="Estimated units · last 7 days" sub={<span>City by city <EstimateTag /></span>}>
        {cmp.data && <ColumnChart height={220} data={cmp.data.map((c) => ({ city: c.city, units: c.est_units_7d }))} x="city" y="units" color="city" byCity />}
      </Card>
    </div>
  );
}
