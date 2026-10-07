'use client';

import { Button, Descriptions, Drawer, Input, Select, Switch, Table, Tag } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { LineChart } from '@/components/charts';
import { AvailTag, Card, CityTag, ErrorState, EstimateTag, Kpi, PageHead, PlatformTag, Prov, SkeletonBlock, fmtDay, fmtINR, fmtIST, fmtNum, shortName } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { availabilityStats, avg, discountAmount, discountPct, listingKey, round1 } from '@/lib/metrics';
import { platformLabel } from '@/lib/config';
import type { Availability, Snapshot } from '@/lib/types';
import { CheckCircleFilled, FireOutlined, PercentageOutlined, TagsOutlined } from '@ant-design/icons';

interface Row {
  key: string;
  s: Snapshot;
  discount_pct: number;
  discount_amt: number;
  sold: number; // est., whole range
  lastSold: number; // est., latest capture only
  restocked: number;
  revenue: number;
}

export default function Products() {
  const d = useDataset();
  const { range, scopeLabel } = useFilters();
  const [q, setQ] = useState('');
  const [avail, setAvail] = useState<Availability | 'all'>('all');
  const [cat, setCat] = useState('all');
  const [line, setLine] = useState('all');
  const [onlyDisc, setOnlyDisc] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);

  const rows: Row[] = useMemo(() => {
    const sold = new Map<string, { units: number; last: number; restocked: number; revenue: number; lastTo: string }>();
    d.intervals.forEach((r) => {
      const cur = sold.get(r.key) ?? { units: 0, last: 0, restocked: 0, revenue: 0, lastTo: '' };
      cur.units += r.units;
      cur.restocked += r.restocked;
      cur.revenue += r.revenue;
      if (r.to > cur.lastTo) {
        cur.lastTo = r.to;
        cur.last = r.units;
      }
      sold.set(r.key, cur);
    });
    return d.latest.map((s) => {
      const k = listingKey(s);
      const v = sold.get(k);
      return { key: k, s, discount_pct: discountPct(s.mrp, s.selling_price), discount_amt: discountAmount(s.mrp, s.selling_price), sold: v?.units ?? 0, lastSold: v?.last ?? 0, restocked: v?.restocked ?? 0, revenue: v?.revenue ?? 0 };
    });
  }, [d.latest, d.intervals]);

  const cats = useMemo(() => Array.from(new Set(rows.map((r) => r.s.category).filter(Boolean))).sort(), [rows]);
  const lines = useMemo(() => Array.from(new Set(rows.map((r) => r.s.line))).sort(), [rows]);
  const filtered = rows.filter(
    (r) => (avail === 'all' || r.s.availability === avail) && (cat === 'all' || r.s.category === cat) && (line === 'all' || r.s.line === line) && (!onlyDisc || r.discount_amt > 0) && `${r.s.name} ${r.s.pack_size} ${r.s.line} ${r.s.product_id}`.toLowerCase().includes(q.toLowerCase()),
  );

  const st = availabilityStats(d.latest);
  const listed = rows.filter((r) => r.s.mrp && r.s.selling_price !== null);
  const avgDisc = round1(avg(listed.map((r) => r.discount_pct)));
  const totalSold = rows.reduce((a, r) => a + r.sold, 0);

  const exportCsv = () => {
    const head = ['platform', 'city', 'pincode', 'store_id', 'product_id', 'name', 'pack_size', 'category', 'mrp', 'selling_price', 'discount_amount', 'discount_pct', 'availability', 'stock', 'est_units_sold_in_range', 'est_units_sold_last_capture', 'restocked_units', 'est_revenue', 'shelf_life_days', 'scraped_at', 'url'];
    const body = filtered.map((r) =>
      [r.s.platform, r.s.city, r.s.pincode, r.s.store_id, r.s.product_id, r.s.name, r.s.pack_size, r.s.category, r.s.mrp, r.s.selling_price, r.discount_amt, r.discount_pct, r.s.availability, r.s.stock, r.sold, r.lastSold, r.restocked, r.revenue, r.s.shelf_life_days, r.s.scraped_at, r.s.url].map((v) => JSON.stringify(v ?? '')).join(','),
    );
    const url = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paperboat_products.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<Row> = [
    { title: 'Product', fixed: 'left', width: 300, sorter: (a, b) => a.s.name.localeCompare(b.s.name), render: (_, r) => (<div><div style={{ fontWeight: 600 }}>{shortName(r.s.name)}</div><div className="muted" style={{ fontSize: 12 }}>{r.s.pack_size || '—'} · {r.s.line} · #{r.s.product_id}</div></div>) },
    { title: 'Platform', width: 120, render: (_, r) => <PlatformTag id={r.s.platform} />, filters: Array.from(new Set(rows.map((r) => r.s.platform))).map((p) => ({ text: platformLabel(p), value: p })), onFilter: (v, r) => r.s.platform === v },
    { title: 'City', width: 100, render: (_, r) => <CityTag city={r.s.city} />, filters: Array.from(new Set(rows.map((r) => r.s.city))).map((c) => ({ text: c, value: c })), onFilter: (v, r) => r.s.city === v },
    { title: 'State', width: 120, render: (_, r) => <AvailTag v={r.s.availability} />, sorter: (a, b) => a.s.availability.localeCompare(b.s.availability) },
    { title: 'MRP', align: 'right', width: 80, sorter: (a, b) => (a.s.mrp ?? 0) - (b.s.mrp ?? 0), render: (_, r) => (r.s.mrp ? fmtINR(r.s.mrp) : '—') },
    { title: 'Price', align: 'right', width: 80, sorter: (a, b) => (a.s.selling_price ?? 0) - (b.s.selling_price ?? 0), render: (_, r) => (r.s.selling_price !== null ? fmtINR(r.s.selling_price) : '—') },
    { title: 'Discount', align: 'right', width: 130, sorter: (a, b) => a.discount_pct - b.discount_pct, render: (_, r) => (r.discount_amt > 0 ? <span><Tag color="green" bordered={false}>{r.discount_pct}%</Tag><span className="muted tnum" style={{ fontSize: 12 }}>−₹{r.discount_amt}</span></span> : <span className="muted">—</span>) },
    { title: 'Stock', align: 'right', width: 80, sorter: (a, b) => a.s.stock - b.s.stock, render: (_, r) => (r.s.availability === 'available' ? <span style={{ color: r.s.stock <= 2 ? 'var(--pb-sunset)' : undefined, fontWeight: r.s.stock <= 2 ? 700 : 400 }}>{r.s.stock}</span> : <span className="muted">0</span>) },
    { title: <span>Sold, {range} d <EstimateTag /></span>, align: 'right', width: 170, sorter: (a, b) => a.sold - b.sold, defaultSortOrder: 'descend', render: (_, r) => <b className="tnum">{fmtNum(r.sold)}</b> },
    { title: <span>Last capture <EstimateTag /></span>, align: 'right', width: 160, sorter: (a, b) => a.lastSold - b.lastSold, render: (_, r) => (r.lastSold ? `−${r.lastSold}` : <span className="muted">0</span>) },
    { title: 'Restocked', align: 'right', width: 100, sorter: (a, b) => a.restocked - b.restocked, render: (_, r) => (r.restocked ? `+${r.restocked}` : <span className="muted">—</span>) },
    { title: 'Shelf life', align: 'right', width: 100, sorter: (a, b) => (a.s.shelf_life_days ?? 0) - (b.s.shelf_life_days ?? 0), render: (_, r) => (r.s.shelf_life_days ? `${r.s.shelf_life_days} d` : '—') },
    { title: 'Captured', width: 150, sorter: (a, b) => a.s.scraped_at.localeCompare(b.s.scraped_at), render: (_, r) => <span className="muted tnum" style={{ fontSize: 12 }}>{fmtIST(r.s.scraped_at)}</span> },
  ];

  if (d.isError) return <ErrorState onRetry={() => d.refetch()} />;

  return (
    <>
      <PageHead title="Products" sub={`Every Paper Boat listing captured · ${scopeLabel} · discount is calculated from MRP and selling price`} actions={<Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!filtered.length}>Export CSV</Button>} />

      <div className="bento" style={{ marginBottom: 16 }}>
        <Kpi className="span-3" hero label="Products" icon={<TagsOutlined />} value={d.isLoading ? '—' : new Set(rows.map((r) => r.s.product_id)).size} note={`${rows.length} listings`} />
        <Kpi className="span-3" label="Buyable now" icon={<CheckCircleFilled />} value={d.isLoading ? '—' : `${st.buyablePct}%`} note={`${st.out_of_stock} out of stock · ${st.not_listed} not listed`} />
        <Kpi className="span-3" label="Avg discount" icon={<PercentageOutlined />} value={d.isLoading ? '—' : `${avgDisc}%`} note="(MRP − price) ÷ MRP" />
        <Kpi className="span-3" label={`Est. units sold · ${range} d`} icon={<FireOutlined />} value={d.isLoading ? '—' : fmtNum(totalSold)} note="estimate from stock changes" />
      </div>

      <Card lift={false} footer={<><Prov>Shelf capture · {d.meta ? fmtIST(d.meta.captured_at) : '…'}</Prov><span>{filtered.length} of {rows.length} listings · click a row for its capture-by-capture history</span></>}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="Search product, pack, line or id" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
          <Select value={avail} onChange={setAvail} style={{ width: 150 }} options={[{ value: 'all', label: 'All states' }, { value: 'available', label: 'Buyable' }, { value: 'out_of_stock', label: 'Out of stock' }, { value: 'not_listed', label: 'Not listed' }]} />
          <Select value={cat} onChange={setCat} style={{ width: 230 }} showSearch options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c.split(' > ').slice(1).join(' › ') || c }))]} />
          <Select value={line} onChange={setLine} style={{ width: 180 }} options={[{ value: 'all', label: 'All product lines' }, ...lines.map((c) => ({ value: c, label: c }))]} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><Switch size="small" checked={onlyDisc} onChange={setOnlyDisc} /> Discounted only</label>
        </div>
        {d.isLoading ? <SkeletonBlock h={320} /> : (
          <Table<Row>
            rowKey="key"
            size="middle"
            columns={columns}
            dataSource={filtered}
            scroll={{ x: 1500 }}
            pagination={{ pageSize: 12, showSizeChanger: true, pageSizeOptions: [12, 25, 50, 100], size: 'small' }}
            onRow={(r) => ({ onClick: () => setOpen(r), style: { cursor: 'pointer' } })}
            locale={{ emptyText: 'No listings match these filters.' }}
          />
        )}
      </Card>

      <ListingDrawer row={open} onClose={() => setOpen(null)} snapshots={d.snapshots} />
    </>
  );
}

/** capture-by-capture history of one listing, with the sold calculation spelled out */
function ListingDrawer({ row, onClose, snapshots }: { row: Row | null; onClose: () => void; snapshots: Snapshot[] }) {
  const hist = useMemo(() => {
    if (!row) return [];
    const g = snapshots.filter((s) => listingKey(s) === row.key).sort((a, b) => (a.scraped_at < b.scraped_at ? -1 : 1));
    return g.map((s, i) => {
      const p = g[i - 1];
      const delta = p && s.availability !== 'not_listed' && p.availability !== 'not_listed' ? p.stock - s.stock : 0;
      return { ...s, i, sold: delta > 0 ? delta : 0, restocked: delta < 0 ? -delta : 0, discount: discountPct(s.mrp, s.selling_price), first: i === 0 };
    });
  }, [row, snapshots]);

  const s = row?.s;
  return (
    <Drawer open={!!row} onClose={onClose} width={760} title={s ? `${shortName(s.name)} · ${s.pack_size}` : ''}>
      {row && s && (
        <div style={{ display: 'grid', gap: 18 }}>
          <Descriptions size="small" column={2} colon={false} items={[
            { key: 'p', label: 'Platform', children: <PlatformTag id={s.platform} /> },
            { key: 'c', label: 'City', children: <CityTag city={s.city} /> },
            { key: 'st', label: 'State', children: <AvailTag v={s.availability} /> },
            { key: 'sk', label: 'Stock now', children: s.stock },
            { key: 'mrp', label: 'MRP', children: s.mrp ? fmtINR(s.mrp) : '—' },
            { key: 'pr', label: 'Selling price', children: s.selling_price !== null ? fmtINR(s.selling_price) : '—' },
            { key: 'di', label: 'Discount', children: row.discount_amt > 0 ? `${row.discount_pct}% (−₹${row.discount_amt})` : 'None' },
            { key: 'sl', label: 'Shelf life', children: s.shelf_life || '—' },
            { key: 'cat', label: 'Category', children: s.category || '—', span: 2 },
            { key: 'store', label: 'Store', children: s.store_address || s.pincode, span: 2 },
          ]} />
          <div className="card" style={{ padding: 14 }}>
            <b>Stock per capture</b>
            <LineChart height={190} data={hist.map((h) => ({ at: `${fmtDay(h.scraped_at.slice(0, 10))} ${h.capture_id.slice(-2)}`, value: h.stock, series: 'Stock (units)' }))} x="at" y="value" color="series" />
          </div>
          <div>
            <b>How units sold are estimated</b> <EstimateTag />
            <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12.5 }}>Sold = stock at the previous capture − stock at this capture, only when stock went down. A rise is a restock and is never counted as sales.</p>
            <Table
              size="small"
              rowKey="scraped_at"
              pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
              dataSource={[...hist].reverse()}
              columns={[
                { title: 'Captured (IST)', dataIndex: 'scraped_at', render: fmtIST },
                { title: 'Stock', dataIndex: 'stock', align: 'right' },
                { title: 'Δ vs previous', align: 'right', render: (_, h) => (h.first ? <span className="muted">first</span> : h.sold ? <span className="delta-down">−{h.sold} sold</span> : h.restocked ? <span className="delta-up">+{h.restocked} restock</span> : <span className="muted">0</span>) },
                { title: 'Price', align: 'right', render: (_, h) => (h.selling_price !== null ? fmtINR(h.selling_price) : '—') },
                { title: 'Disc.', align: 'right', render: (_, h) => (h.discount ? `${h.discount}%` : '—') },
                { title: 'State', render: (_, h) => <AvailTag v={h.availability} /> },
              ]}
            />
          </div>
          <a href={s.url} target="_blank" rel="noreferrer"><Button block>Open on {platformLabel(s.platform)} ↗</Button></a>
        </div>
      )}
    </Drawer>
  );
}
