'use client';

import { Alert, Segmented, Select, Table, Tag } from 'antd';
import { DollarOutlined, FireOutlined, InboxOutlined, WarningOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { ColumnChart, LineChart } from '@/components/charts';
import { AvailTag, Card, CityTag, ErrorState, EstimateTag, Kpi, PageHead, PlatformTag, Prov, SkeletonBlock, fmtDay, fmtINR, fmtIST, fmtNum, shortName } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { availabilityStats, dailySellout, listingKey, sum } from '@/lib/metrics';

const SLOT_IST = ['06:00', '12:00', '20:00'];
/** '2026-09-29-S2' -> '29 Sep · 12:00' */
const captureLabel = (id: string) => `${fmtDay(id.slice(0, 10))} · ${SLOT_IST[Number(id.slice(-1)) - 1] ?? ''}`;

export default function StockPage() {
  const d = useDataset();
  const { range, scopeLabel, multiPlatform } = useFilters();
  const [metric, setMetric] = useState<'units' | 'revenue'>('units');
  const [pick, setPick] = useState<string | undefined>();

  const series = (r: { platform: string; city: string }) => (multiPlatform ? `${platformLabel(r.platform)} · ${r.city}` : r.city);

  const perCapture = useMemo(() => {
    const m = new Map<string, { id: string; from: string; to: string; listings: number; stock: number; avail: ReturnType<typeof availabilityStats>; sold: number; restocked: number; revenue: number }>();
    const bySnap = new Map<string, typeof d.snapshots>();
    d.snapshots.forEach((s) => (bySnap.get(s.capture_id) ?? bySnap.set(s.capture_id, []).get(s.capture_id)!).push(s));
    bySnap.forEach((rows, id) => {
      const times = rows.map((r) => r.scraped_at).sort();
      m.set(id, { id, from: times[0], to: times[times.length - 1], listings: rows.length, stock: sum(rows.map((r) => r.stock)), avail: availabilityStats(rows), sold: 0, restocked: 0, revenue: 0 });
    });
    d.intervals.forEach((r) => {
      const c = m.get(r.capture_id);
      if (c) {
        c.sold += r.units;
        c.restocked += r.restocked;
        c.revenue += r.revenue;
      }
    });
    return Array.from(m.values()).sort((a, b) => (a.id < b.id ? -1 : 1));
  }, [d.snapshots, d.intervals]);

  const unitsPerCapture = useMemo(() => {
    const m = new Map<string, number>();
    d.intervals.forEach((r) => m.set(`${r.capture_id}|${series(r)}`, (m.get(`${r.capture_id}|${series(r)}`) ?? 0) + r.units));
    return Array.from(m.entries()).map(([k, v]) => {
      const [id, s] = k.split('|');
      return { capture: captureLabel(id), id, series: s, units: v };
    }).sort((a, b) => (a.id < b.id ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.intervals, multiPlatform]);

  const daily = useMemo(() => dailySellout(d.intervals, series), [d.intervals, multiPlatform]); // eslint-disable-line react-hooks/exhaustive-deps
  const stockLine = useMemo(() => {
    const m = new Map<string, number>();
    d.snapshots.forEach((s) => m.set(`${s.capture_id}|${series(s)}`, (m.get(`${s.capture_id}|${series(s)}`) ?? 0) + s.stock));
    return Array.from(m.entries()).map(([k, v]) => { const [id, s] = k.split('|'); return { capture: captureLabel(id), id, series: s, stock: v }; }).sort((a, b) => (a.id < b.id ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.snapshots, multiPlatform]);

  const days = Math.max(1, new Set(d.intervals.map((r) => r.day)).size);
  const totalUnits = sum(d.intervals.map((r) => r.units));
  const totalRev = sum(d.intervals.map((r) => r.revenue));
  const totalRestock = sum(d.intervals.map((r) => r.restocked));
  const oosNow = d.latest.filter((s) => s.availability === 'out_of_stock');

  const listings = useMemo(() => {
    const sold = new Map<string, { units: number; revenue: number }>();
    d.intervals.forEach((r) => { const c = sold.get(r.key) ?? { units: 0, revenue: 0 }; c.units += r.units; c.revenue += r.revenue; sold.set(r.key, c); });
    return d.latest.filter((s) => s.availability !== 'not_listed').map((s) => {
      const k = listingKey(s);
      const v = sold.get(k) ?? { units: 0, revenue: 0 };
      const perDay = v.units / days;
      return { key: k, s, units: v.units, revenue: v.revenue, perDay, cover: perDay > 0 ? Math.round((s.stock / perDay) * 10) / 10 : null };
    });
  }, [d.latest, d.intervals, days]);

  const top = [...listings].sort((a, b) => b.units - a.units).slice(0, 10);
  const risk = listings.filter((l) => l.s.availability === 'out_of_stock' || (l.s.stock <= 2)).sort((a, b) => a.s.stock - b.s.stock).slice(0, 12);

  const sel = pick ?? top[0]?.key;
  const selListing = listings.find((l) => l.key === sel);
  const selIntervals = useMemo(() => d.intervals.filter((r) => r.key === sel).sort((a, b) => (a.to < b.to ? 1 : -1)), [d.intervals, sel]);

  // worked example: the single biggest observed drop
  const example = useMemo(() => d.intervals.reduce<(typeof d.intervals)[number] | null>((best, r) => (!best || r.units > best.units ? r : best), null), [d.intervals]);

  if (d.isError) return <ErrorState onRetry={() => d.refetch()} />;

  return (
    <>
      <PageHead title="Stock & Sell-out" sub={`How many were sold, from the stock seen at each capture · ${scopeLabel} · last ${range} days`} />
      <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 14 }} message="Units sold are an estimate" description="The backend captures each listing three times a day. For two consecutive captures of the same listing (ordered by scraped_at), a drop in stock is counted as units sold and a rise as a restock. Sales that are restocked inside one capture gap cannot be seen, so the figure is a lower bound." />

      <div className="bento">
        <Kpi className="span-3" hero label="Est. units sold" icon={<FireOutlined />} value={d.isLoading ? '—' : fmtNum(totalUnits)} note={`~${fmtNum(Math.round(totalUnits / days))} a day · estimate`} />
        <Kpi className="span-3" label="Est. revenue" icon={<DollarOutlined />} value={d.isLoading ? '—' : `₹${fmtNum(Math.round(totalRev))}`} note="units × selling price · estimate" />
        <Kpi className="span-3" label="Units restocked" icon={<InboxOutlined />} value={d.isLoading ? '—' : fmtNum(totalRestock)} note="stock increases, not counted as sales" />
        <Kpi className="span-3" label="Out of stock now" icon={<WarningOutlined />} value={d.isLoading ? '—' : oosNow.length} note={`of ${availabilityStats(d.latest).listed} listed listings`} />

        <Card className="span-5" title="How a sale is counted" sub="Worked example from your latest data" footer={<Prov>{d.captures.length} captures in range</Prov>}>
          {example && example.units > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div><b>{shortName(example.name)}</b> · {example.pack_size} <CityTag city={example.city} /></div>
              <div className="card" style={{ padding: 12, background: 'var(--raised)', boxShadow: 'none' }}>
                <div className="muted" style={{ fontSize: 12 }}>Capture A · {fmtIST(example.from)}</div>
                <div className="display tnum" style={{ fontSize: 26 }}>{example.stock_from} <span className="muted" style={{ fontSize: 13 }}>in stock</span></div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Capture B · {fmtIST(example.to)} ({example.hours} h later)</div>
                <div className="display tnum" style={{ fontSize: 26 }}>{example.stock_to} <span className="muted" style={{ fontSize: 13 }}>in stock</span></div>
              </div>
              <div style={{ fontSize: 14 }}>{example.stock_from} − {example.stock_to} = <b>{example.units} units sold</b> <EstimateTag /> · × ₹{example.price} = <b>{fmtINR(example.revenue)}</b></div>
            </div>
          ) : <span className="muted">No stock drops in this range.</span>}
        </Card>
        <Card className="span-7" title={<span>Units sold per capture <EstimateTag /></span>} sub="Stock drop since the previous capture, summed over every listing" footer={<Prov>3 captures a day · 06:00 · 12:00 · 20:00 IST</Prov>}>
          {d.isLoading ? <SkeletonBlock /> : <ColumnChart data={unitsPerCapture} x="capture" y="units" color="series" stack height={260} />}
        </Card>

        <Card className="span-6" title={<span>Daily sell-out <EstimateTag /></span>} sub="By IST day" actions={<Segmented size="small" value={metric} onChange={(v) => setMetric(v as 'units' | 'revenue')} options={[{ label: 'Units', value: 'units' }, { label: 'Revenue', value: 'revenue' }]} />}>
          {d.isLoading ? <SkeletonBlock /> : <ColumnChart data={daily.map((r) => ({ date: fmtDay(r.date), series: r.series, value: metric === 'units' ? r.units : Math.round(r.revenue) }))} x="date" y="value" color="series" formatter={(v) => (metric === 'revenue' ? `₹${Math.round(v / 1000)}k` : String(v))} />}
        </Card>
        <Card className="span-6" title="Units on the shelf" sub="Total stock seen at each capture — restocks show as jumps" footer={<Prov>Shelf capture</Prov>}>
          {d.isLoading ? <SkeletonBlock /> : <LineChart data={stockLine} x="capture" y="stock" color="series" />}
        </Card>

        <Card className="span-12" title="Capture log" sub="Every capture run, with what was seen and what moved since the one before" footer={<Prov>scraped_at · ordered oldest to newest · newest first below</Prov>}>
          <Table
            size="small"
            rowKey="id"
            loading={d.isLoading}
            pagination={{ pageSize: 8, size: 'small' }}
            dataSource={[...perCapture].reverse()}
            scroll={{ x: 900 }}
            columns={[
              { title: 'Capture', dataIndex: 'id', render: (id: string) => <b>{captureLabel(id)}</b> },
              { title: 'Scraped (IST)', render: (_, c) => <span className="muted tnum">{fmtIST(c.from)} → {fmtIST(c.to).split(', ').pop()}</span> },
              { title: 'Listings', dataIndex: 'listings', align: 'right' },
              { title: 'Buyable', align: 'right', render: (_, c) => `${c.avail.buyablePct}%` },
              { title: 'Units on shelf', dataIndex: 'stock', align: 'right', render: fmtNum },
              { title: <span>Sold since previous <EstimateTag /></span>, dataIndex: 'sold', align: 'right', render: (v: number) => <b className="tnum">{fmtNum(v)}</b> },
              { title: 'Restocked', dataIndex: 'restocked', align: 'right', render: (v: number) => (v ? `+${fmtNum(v)}` : '—') },
              { title: 'Est. revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => `₹${fmtNum(Math.round(v))}` },
            ]}
          />
        </Card>

        <Card className="span-7" title="Top sellers" sub="Est. units sold in range, with stock left and days of cover" footer={<Prov>Estimate · days of cover = stock ÷ average units a day</Prov>}>
          <Table
            size="small"
            rowKey="key"
            loading={d.isLoading}
            pagination={false}
            dataSource={top}
            scroll={{ x: 640 }}
            columns={[
              { title: 'Product', render: (_, l) => (<div><div style={{ fontWeight: 600 }}>{shortName(l.s.name)}</div><div className="muted" style={{ fontSize: 12 }}>{l.s.pack_size}</div></div>) },
              { title: 'City', render: (_, l) => <CityTag city={l.s.city} /> },
              { title: 'Est. units', dataIndex: 'units', align: 'right', render: (v: number) => <b className="tnum">{fmtNum(v)}</b> },
              { title: 'Est. revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => `₹${fmtNum(Math.round(v))}` },
              { title: 'Stock', align: 'right', render: (_, l) => l.s.stock },
              { title: 'Cover', align: 'right', render: (_, l) => (l.cover === null ? '—' : <Tag bordered={false} color={l.cover < 1 ? 'red' : l.cover < 2 ? 'orange' : 'default'}>{l.cover} d</Tag>) },
            ]}
          />
        </Card>
        <Card className="span-5" title="Out of stock & running low" sub="Stock of 2 or fewer, or already at zero" footer={<Prov>Latest capture</Prov>}>
          <Table
            size="small"
            rowKey="key"
            loading={d.isLoading}
            pagination={false}
            dataSource={risk}
            columns={[
              { title: 'Product', render: (_, l) => (<div><div style={{ fontWeight: 600 }}>{shortName(l.s.name)}</div><div className="muted" style={{ fontSize: 12 }}>{l.s.pack_size} · <CityTag city={l.s.city} /></div></div>) },
              { title: 'State', render: (_, l) => <AvailTag v={l.s.availability} /> },
              { title: 'Stock', align: 'right', dataIndex: ['s', 'stock'] },
            ]}
          />
        </Card>

        <Card className="span-12" title="Listing explorer" sub="Pick a listing to see every capture, the stock seen, and the units counted as sold" actions={
          <Select showSearch style={{ width: 360, maxWidth: '100%' }} value={sel} onChange={setPick} optionFilterProp="label" placeholder="Choose a listing"
            options={listings.map((l) => ({ value: l.key, label: `${shortName(l.s.name)} · ${l.s.pack_size} · ${l.s.city}` }))} />
        }>
          {selListing && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <PlatformTag id={selListing.s.platform} /><CityTag city={selListing.s.city} /><AvailTag v={selListing.s.availability} />
              <Tag bordered={false}>Stock now {selListing.s.stock}</Tag><Tag bordered={false}>Est. sold {selListing.units}</Tag>
            </div>
          )}
          <Table
            size="small"
            rowKey={(r) => r.to}
            pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
            dataSource={selIntervals}
            scroll={{ x: 760 }}
            columns={[
              { title: 'From (IST)', dataIndex: 'from', render: fmtIST },
              { title: 'To (IST)', dataIndex: 'to', render: fmtIST },
              { title: 'Stock before', dataIndex: 'stock_from', align: 'right' },
              { title: 'Stock after', dataIndex: 'stock_to', align: 'right' },
              { title: <span>Sold <EstimateTag /></span>, dataIndex: 'units', align: 'right', render: (v: number, r) => (r.oos ? <span className="muted">out of stock</span> : v ? <b className="delta-down">−{v}</b> : <span className="muted">0</span>) },
              { title: 'Restocked', dataIndex: 'restocked', align: 'right', render: (v: number) => (v ? <span className="delta-up">+{v}</span> : '—') },
              { title: 'Price', dataIndex: 'price', align: 'right', render: (v: number) => fmtINR(v) },
              { title: 'Est. revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => (v ? fmtINR(v) : '—') },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
