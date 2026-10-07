'use client';

import { useMemo, useState } from 'react';
import { Button, Segmented, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeploymentUnitOutlined, FieldTimeOutlined, InboxOutlined, SwapOutlined, WarningOutlined } from '@ant-design/icons';
import { BarChart } from '@/components/charts';
import { Card, CityTag, EstimateTag, Kpi, Prov, fmtINR, fmtNum } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { avg, round1, sum } from '@/lib/metrics';
import { Gate, computeInventory, type InvRisk, type InvRow } from './partsB';

const RISK_COLOR: Record<InvRisk, string> = { 'Dead-stock risk': 'error', 'Low cover': 'warning', Watch: 'processing', 'Out of stock': 'default', Healthy: 'success' };

export default function InventoryTab() {
  const d = useDataset();
  const [filter, setFilter] = useState<'All' | 'Dead-stock risk' | 'Low cover'>('All');
  const [done, setDone] = useState<Record<string, 'approved' | 'drafted'>>({});
  const inv = useMemo(() => computeInventory(d.latest, d.intervals), [d.latest, d.intervals]);

  const m = useMemo(() => {
    const cities = Array.from(new Set(inv.map((r) => r.city)));
    const cover = cities.map((city) => {
      const rs = inv.filter((r) => r.city === city);
      const rate = sum(rs.map((r) => r.perDay));
      return { city, days: rate > 0 ? round1(sum(rs.map((r) => r.stock)) / rate) : 0 };
    });
    // rebalance: same SKU, one city with much more cover than another
    const byProd = new Map<string, InvRow[]>();
    inv.filter((r) => r.cover !== null).forEach((r) => { const k = `${r.platform}|${r.product_id}`; (byProd.get(k) ?? byProd.set(k, []).get(k)!).push(r); });
    const rebal: { id: string; name: string; from: string; to: string; units: number; reason: string; value: number }[] = [];
    byProd.forEach((rs, k) => {
      if (rs.length < 2) return;
      const hi = rs.reduce((a, b) => ((a.cover as number) >= (b.cover as number) ? a : b));
      const lo = rs.reduce((a, b) => ((a.cover as number) <= (b.cover as number) ? a : b));
      const units = Math.floor((hi.stock - lo.stock) / 2);
      if (hi.city !== lo.city && (hi.cover as number) >= 2 * ((lo.cover as number) || 0.5) && units >= 1)
        rebal.push({ id: k, name: `${hi.name} · ${hi.pack}`, from: hi.city, to: lo.city, units, reason: `${lo.city} cover ${lo.cover} d vs ${hi.city} ${hi.cover} d`, value: units * hi.price });
    });
    rebal.sort((a, b) => b.value - a.value);
    const dead = inv.filter((r) => r.risk === 'Dead-stock risk');
    const low = inv.filter((r) => r.risk === 'Low cover');
    const covers = inv.filter((r) => r.cover !== null).map((r) => r.cover as number);
    return { cover, rebal: rebal.slice(0, 6), dead, low, avgCover: round1(avg(covers)) };
  }, [inv]);

  const rows = useMemo(() => (filter === 'All' ? inv : inv.filter((r) => r.risk === filter)).slice().sort((a, b) => b.stock - a.stock), [inv, filter]);
  const act = (id: string, kind: 'approved' | 'drafted') => { setDone((s) => ({ ...s, [id]: kind })); message.success(kind === 'approved' ? 'Approved — transfer request sent to the supply planner' : 'Transfer request drafted'); };

  const cols: ColumnsType<InvRow> = [
    { title: 'Product', dataIndex: 'name', fixed: 'left', render: (n: string, r) => <><b>{n}</b> <span className="muted">{r.pack}</span></> },
    { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> },
    { title: 'Units on shelf', dataIndex: 'stock', align: 'right', sorter: (a, b) => a.stock - b.stock },
    { title: <>Est. units / day <EstimateTag /></>, dataIndex: 'perDay', align: 'right' },
    { title: 'Days of cover', dataIndex: 'cover', align: 'right', sorter: (a, b) => (a.cover ?? 9999) - (b.cover ?? 9999), render: (v: number | null) => (v === null ? <span className="muted">no sales seen</span> : `${v} d`) },
    { title: 'Shelf life', dataIndex: 'shelfLifeDays', align: 'right', render: (v: number | null) => (v ? `${v} d` : '—') },
    { title: 'Risk', dataIndex: 'risk', render: (r: InvRisk) => <Tag color={RISK_COLOR[r]} bordered={false}>{r}</Tag> },
  ];
  const real = <Prov>Shelf capture · stock and shelf life</Prov>;

  return (
    <Gate loading={d.isLoading} error={d.isError} onRetry={() => d.refetch()} empty={!inv.length}>
      <div className="bento">
        <Kpi className="span-3" label="Stock on hand" value={fmtNum(sum(inv.map((r) => r.stock)))} icon={<InboxOutlined />} note={`${inv.length} SKU × city listings`} />
        <Kpi className="span-3" label="Dead-stock risk" value={fmtNum(sum(m.dead.map((r) => r.stock)))} icon={<WarningOutlined />} note={`${m.dead.length} listings: cover > 25% of shelf life`} />
        <Kpi className="span-3" label="Low cover" value={`${m.low.length} SKU${m.low.length === 1 ? '' : 's'}`} icon={<FieldTimeOutlined />} note="under 2 days of cover (est.)" />
        <Kpi className="span-3" label="Avg. days of cover" value={`${m.avgCover} d`} icon={<DeploymentUnitOutlined />} note="est. from stock changes" />

        <Card className="span-12" title="Stock position and shelf life" sub="Shelf stock by SKU and city with days of cover and expiry risk" footer={<>Days of cover = latest stock ÷ estimated units per day. Shelf life is the pack’s total shelf life from the listing. {real}</>}
          actions={<Segmented size="small" value={filter} onChange={(v) => setFilter(v as typeof filter)} options={['All', 'Dead-stock risk', 'Low cover']} aria-label="Filter risk" />}>
          <Table<InvRow> size="small" rowKey="key" columns={cols} dataSource={rows} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} locale={{ emptyText: 'Nothing in this risk band.' }} />
        </Card>
        <Card className="span-7" title="Rebalancing recommendations" sub="Move inventory to where demand and shelf life justify it" footer={<>Needs the same SKU in two or more cities. Value = units × selling price. <EstimateTag /></>}>
          {m.rebal.length === 0 ? <div className="muted">No city pair has a cover gap large enough to rebalance.</div> : m.rebal.map((r) => (
            <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div><b>{r.name}</b> · {fmtNum(r.units)} units · {r.from} → {r.to}</div>
              <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>{r.reason} · protects about {fmtINR(Math.round(r.value))} <SwapOutlined /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="small" onClick={() => act(r.id, 'drafted')} disabled={!!done[r.id]}>Review</Button>
                <Button size="small" type="primary" onClick={() => act(r.id, 'approved')} disabled={done[r.id] === 'approved'}>{done[r.id] === 'approved' ? 'Approved' : 'Approve'}</Button>
              </div>
            </div>
          ))}
        </Card>
        <Card className="span-5" title="Days of cover by city" footer={<>Stock-weighted. Target band 2–14 d for dark stores. {real}</>}>
          <BarChart data={m.cover} x="city" y="days" color="city" height={260} formatter={(v) => `${v} d`} />
        </Card>
      </div>
    </Gate>
  );
}
