'use client';

import { useMemo, useState } from 'react';
import { Segmented, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { Card, CityTag, EstimateTag, Heat, PlatformTag, Prov } from '@/components/ui';
import { CITIES, platformLabel } from '@/lib/config';
import { dashB } from '@/lib/api.dashboardB';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { availabilityStats, avg, discountPct, round1, sum } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';
import { Gate } from './partsB';

interface StoreRow { key: string; store_id: string; name: string; address: string; pincode: string; listed: number; buyable: number }
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export default function NetworkTab() {
  const { platforms, cities } = useFilters();
  const d = useDataset();
  const sla = useQuery({ queryKey: ['dashB', 'sla', platforms, cities], queryFn: () => dashB.sla(platforms, cities) });
  const beyond = useQuery({ queryKey: ['dashB', 'beyond'], queryFn: () => dashB.beyond() });
  const [cityPick, setCityPick] = useState<string | null>(null);
  const city = cityPick && cities.includes(cityPick) ? cityPick : cities[0];

  const m = useMemo(() => {
    const byCity = (c: string) => d.latest.filter((s) => s.city === c);
    const stores = (c: string): StoreRow[] => {
      const mp = new Map<string, Snapshot[]>();
      byCity(c).forEach((s) => { const k = `${s.store_id ?? s.pincode}`; (mp.get(k) ?? mp.set(k, []).get(k)!).push(s); });
      return Array.from(mp.entries()).map(([k, rs]) => {
        const st = availabilityStats(rs);
        return { key: k, store_id: rs[0].store_id ?? '—', name: rs[0].store_name ?? 'Store name not published', address: rs[0].store_address ?? '—', pincode: rs[0].pincode, listed: st.listed, buyable: st.buyablePct };
      });
    };
    const days = Math.max(1, new Set(d.intervals.map((i) => i.day)).size);
    const score = cities.map((c) => {
      const rs = byCity(c);
      const listedRows = rs.filter((r) => r.availability !== 'not_listed');
      const st = availabilityStats(rs);
      const priced = listedRows.filter((r) => r.mrp);
      return {
        city: c,
        tracked: CITIES.find((x) => x.id === c)?.stores ?? 0,
        observed: new Set(rs.map((r) => r.store_id ?? r.pincode)).size,
        skus: new Set(listedRows.map((r) => r.product_id)).size,
        buyable: st.buyablePct,
        disc: round1(avg(priced.map((r) => discountPct(r.mrp, r.selling_price)))),
        units: Math.round(sum(d.intervals.filter((i) => i.city === c).map((i) => i.units)) / days),
      };
    });
    const heat = cities.map((c) => ({ city: c, cells: Object.fromEntries(platforms.map((p) => [p, availabilityStats(d.latest.filter((s) => s.city === c && s.platform === p))])) }));
    return { stores, score, heat };
  }, [d.latest, d.intervals, cities, platforms]);

  const slaCells = useMemo(() => sla.data ?? [], [sla.data]);
  const slaMed = (c: string) => median(slaCells.filter((s) => s.city === c).map((s) => s.minutes));
  const storeRows = m.stores(city ?? '');
  const real = <Prov>Shelf capture · {d.meta ? new Date(d.meta.captured_at).toISOString().slice(0, 10) : ''}</Prov>;

  const storeCols: ColumnsType<StoreRow> = [
    { title: 'Store ID', dataIndex: 'store_id', render: (v: string) => <code>{v}</code> },
    { title: 'Store', dataIndex: 'name' },
    { title: 'Address', dataIndex: 'address', ellipsis: true },
    { title: 'Pincode', dataIndex: 'pincode' },
    { title: 'SKUs listed', dataIndex: 'listed', align: 'right' },
    { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (v: number) => <Heat v={v} /> },
  ];
  const scoreCols: ColumnsType<(typeof m.score)[number]> = [
    { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> },
    { title: 'Dark stores', dataIndex: 'tracked', align: 'right' },
    { title: 'Observed', dataIndex: 'observed', align: 'right' },
    { title: 'SKUs', dataIndex: 'skus', align: 'right' },
    { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (v: number) => <Heat v={v} /> },
    { title: 'Avg discount', dataIndex: 'disc', align: 'right', render: (v: number) => `${v}%` },
    { title: <>Est. units / day <EstimateTag /></>, dataIndex: 'units', align: 'right' },
    { title: 'Delivery (median)', dataIndex: 'city', key: 'sla', align: 'right', render: (c: string) => `${slaMed(c)} min` },
  ];

  return (
    <Gate loading={d.isLoading || sla.isLoading} error={d.isError || sla.isError} onRetry={() => { d.refetch(); sla.refetch(); }} empty={!d.latest.length}>
      <div className="bento">
        <Card className="span-7" title="Dark-store network" sub={`${city} · ${CITIES.find((c) => c.id === city)?.stores ?? '—'} dark stores on the network, ${storeRows.length} in the capture`}
          actions={cities.length > 1 ? <Segmented size="small" value={city} onChange={(v) => setCityPick(String(v))} options={cities} aria-label="City" /> : undefined}
          footer={<>Directory is built from the distinct store id, name, address and pincode in the capture. {real}</>}>
          <Table<StoreRow> size="small" rowKey="key" pagination={{ pageSize: 6, hideOnSinglePage: true }} columns={storeCols} dataSource={storeRows} scroll={{ x: 'max-content' }} />
        </Card>
        <Card className="span-5" title="City scorecard" footer={<>{real}<Prov kind="sample">Delivery minutes sample</Prov></>}>
          <Table size="small" rowKey="city" pagination={false} columns={scoreCols} dataSource={m.score} scroll={{ x: 'max-content' }} />
        </Card>
        <Card className="span-12" title="Availability by city and platform" sub="Buyable share, with out-of-stock and not-serviceable (not listed) counts" footer={<>Buyable % is of listed products. Out of stock and not listed are different states. {real}</>}>
          <Table size="small" rowKey="city" pagination={false} scroll={{ x: 'max-content' }} dataSource={m.heat}
            columns={[
              { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> },
              ...platforms.map((p) => ({
                title: platformLabel(p),
                key: p,
                render: (_: unknown, r: (typeof m.heat)[number]) => {
                  const st = r.cells[p];
                  return st.total ? <div style={{ minWidth: 150 }}><Heat v={st.buyablePct} /><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{st.available} buyable · {st.out_of_stock} out of stock · {st.not_listed} not serviceable</div></div> : <span className="muted">—</span>;
                },
              })),
            ]} />
        </Card>
        <Card className="span-7" title="Network beyond the connected cities" sub="Where quick commerce has dark stores and the shelf is not yet observed"
          footer={<>{sum(CITIES.filter((c) => !c.connected).map((c) => c.stores)).toLocaleString('en-IN')} dark stores sit in cities we do not capture yet. <Prov kind="sample">Sample data</Prov></>}>
          {beyond.isLoading ? null : (
            <Table size="small" rowKey="city" pagination={false} dataSource={beyond.data ?? []} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> },
                { title: 'Dark stores', dataIndex: 'stores', align: 'right' },
                { title: 'Platforms present', dataIndex: 'platforms', render: (ps: { platform: string; n: number }[]) => ps.slice(0, 5).map((p) => <Tag key={p.platform} bordered={false}>{platformLabel(p.platform)} {p.n}</Tag>) },
                { title: 'Shelf observed', key: 'obs', render: () => <Tag bordered={false}>Shelf not yet observed</Tag> },
              ]} />
          )}
        </Card>
        <Card className="span-5" title="Promised delivery time" sub="Median minutes on the listing, platform × city" footer={<Prov kind="sample">Sample data</Prov>}>
          <Table size="small" rowKey="platform" pagination={false} scroll={{ x: 'max-content' }} dataSource={platforms.map((p) => ({ platform: p }))}
            columns={[
              { title: 'Platform', dataIndex: 'platform', render: (p: string) => <PlatformTag id={p} /> },
              ...cities.map((c) => ({ title: c, key: c, align: 'right' as const, render: (_: unknown, r: { platform: string }) => { const v = slaCells.find((s) => s.platform === r.platform && s.city === c)?.minutes; return v ? <Tag color={v <= 10 ? 'success' : v <= 15 ? 'processing' : 'warning'} bordered={false}>{v} min</Tag> : '—'; } })),
            ]} />
        </Card>
      </div>
    </Gate>
  );
}
