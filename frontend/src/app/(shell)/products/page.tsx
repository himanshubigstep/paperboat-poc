'use client';

import { Button, Descriptions, Drawer, Input, Select, Table, Tag } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LineChart } from '@/components/charts';
import { AvailTag, Card, CityTag, ErrorState, EstimateTag, PageHead, Prov, fmtDay, fmtIST, fmtINR } from '@/components/ui';
import { useFilters } from '@/hooks/useFilters';
import { api } from '@/lib/api';
import { DAYS } from '@/mock/data';
import type { Availability, Listing } from '@/lib/types';

function history(l: Listing) {
  let seed = Number(l.product_id) + (l.city === 'Delhi' ? 1 : 2);
  const next = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return DAYS.flatMap((d, i) => {
    const jitter = Math.round((next() - 0.5) * 6);
    return [
      { date: fmtDay(d), series: 'Selling price (₹)', value: Math.max(1, l.selling_price + jitter * (i % 3 === 0 ? 1 : 0)) },
      { date: fmtDay(d), series: 'Stock (units)', value: l.availability === 'available' ? Math.max(0, l.stock + Math.round((next() - 0.5) * 8)) : 0 },
    ];
  });
}

export default function Products() {
  const { city } = useFilters();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['listings', city], queryFn: () => api.listings(city) });
  const [q, setQ] = useState('');
  const [avail, setAvail] = useState<Availability | 'all'>('all');
  const [cat, setCat] = useState<string>('all');
  const [open, setOpen] = useState<Listing | null>(null);

  const rows = useMemo(
    () => (data ?? []).filter((l) => (avail === 'all' || l.availability === avail) && (cat === 'all' || l.category === cat) && `${l.name} ${l.pack_size} ${l.line}`.toLowerCase().includes(q.toLowerCase())),
    [data, q, avail, cat],
  );
  const cats = Array.from(new Set((data ?? []).map((l) => l.category)));

  const exportCsv = () => {
    const head = ['product_id', 'name', 'pack_size', 'category', 'city', 'mrp', 'selling_price', 'discount_pct', 'availability', 'stock', 'est_units_7d', 'scraped_at', 'url'];
    const body = rows.map((r) => head.map((h) => JSON.stringify((r as unknown as Record<string, unknown>)[h] ?? '')).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paperboat_blinkit_products.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<Listing> = [
    { title: 'Product', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name), render: (v, r) => (<div><div style={{ fontWeight: 600 }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{r.pack_size} · {r.line}</div></div>) },
    { title: 'City', dataIndex: 'city', width: 100, render: (c) => <CityTag city={c} /> },
    { title: 'State', dataIndex: 'availability', width: 120, render: (v) => <AvailTag v={v} />, sorter: (a, b) => a.availability.localeCompare(b.availability) },
    { title: 'MRP', dataIndex: 'mrp', align: 'right', width: 90, sorter: (a, b) => a.mrp - b.mrp, render: (v) => (v ? fmtINR(v) : '—') },
    { title: 'Price', dataIndex: 'selling_price', align: 'right', width: 90, sorter: (a, b) => a.selling_price - b.selling_price, render: (v) => (v ? fmtINR(v) : '—') },
    { title: 'Discount', dataIndex: 'discount_pct', align: 'right', width: 100, sorter: (a, b) => a.discount_pct - b.discount_pct, render: (v) => (v > 0 ? <Tag color="green" bordered={false}>{v}%</Tag> : <span className="muted">—</span>) },
    { title: 'Stock', dataIndex: 'stock', align: 'right', width: 80, sorter: (a, b) => a.stock - b.stock },
    { title: <span>Est. units 7d <EstimateTag /></span>, dataIndex: 'est_units_7d', align: 'right', width: 150, sorter: (a, b) => a.est_units_7d - b.est_units_7d },
    { title: 'Best rank', dataIndex: 'best_rank', align: 'right', width: 100, sorter: (a, b) => (a.best_rank ?? 99) - (b.best_rank ?? 99), render: (v) => (v ? `#${v}` : '—') },
  ];

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <>
      <PageHead title="Products" sub="Every priority Paper Boat listing on Blinkit, by city" actions={<Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>} />
      <Card lift={false} footer={<><Prov>Shelf capture · {data?.[0] ? fmtIST(data[0].scraped_at) : '…'}</Prov><span>{rows.length} of {data?.length ?? 0} listings · click a row for history</span></>}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="Search product, pack or line" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
          <Select value={avail} onChange={setAvail} style={{ width: 160 }} options={[{ value: 'all', label: 'All states' }, { value: 'available', label: 'Buyable' }, { value: 'out_of_stock', label: 'Out of stock' }, { value: 'not_listed', label: 'Not listed' }]} />
          <Select value={cat} onChange={setCat} style={{ width: 200 }} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))]} />
        </div>
        <Table<Listing>
          rowKey="key"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 10, showSizeChanger: false, size: 'small' }}
          onRow={(r) => ({ onClick: () => setOpen(r), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No listings match these filters.' }}
        />
      </Card>

      <Drawer open={!!open} onClose={() => setOpen(null)} width={560} title={open ? `${open.name} · ${open.pack_size}` : ''}>
        {open && (
          <div style={{ display: 'grid', gap: 20 }}>
            <Descriptions size="small" column={2} colon={false} items={[
              { key: 'c', label: 'City', children: <CityTag city={open.city} /> },
              { key: 's', label: 'State', children: <AvailTag v={open.availability} /> },
              { key: 'p', label: 'Price', children: open.selling_price ? `${fmtINR(open.selling_price)} (MRP ${fmtINR(open.mrp)})` : '—' },
              { key: 'st', label: 'Stock', children: open.stock },
              { key: 'cat', label: 'Category', children: open.category },
              { key: 'store', label: 'Store', children: open.store_id },
            ]} />
            <div>
              <b>Last {DAYS.length} days</b>
              <LineChart height={240} data={history(open)} x="date" y="value" color="series" />
            </div>
            <a href={open.url} target="_blank" rel="noreferrer"><Button block>Open on Blinkit ↗</Button></a>
          </div>
        )}
      </Drawer>
    </>
  );
}
