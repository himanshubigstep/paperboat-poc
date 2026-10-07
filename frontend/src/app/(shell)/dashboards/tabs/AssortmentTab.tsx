'use client';

import { useMemo } from 'react';
import { Button, Progress, Table, Tag, message } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { BarChart, ColumnChart } from '@/components/charts';
import { AvailTag, Card, CityTag, EmptyState, EstimateTag, Heat, Prov, Section, fmtINR, fmtNum, shortName } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { availabilityStats, avg, discountPct, groupSum, round1 } from '@/lib/metrics';
import type { Availability, Snapshot } from '@/lib/types';
import { PACK_BUCKETS, contentHealth, listed, packBucket, packMl, seeded } from '@/mock/dashboard-a';
import { TabGate } from './aShared';

type Cell = { platform: string; city: string; key: string };
const cellStatus = (rows: Snapshot[], cell: Cell, pid: string): Availability => {
  const m = rows.filter((r) => r.platform === cell.platform && r.city === cell.city && r.product_id === pid);
  if (m.some((r) => r.availability === 'available')) return 'available';
  if (m.some((r) => r.availability === 'out_of_stock')) return 'out_of_stock';
  return 'not_listed';
};
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 1000) / 10 : 0);

export default function AssortmentTab() {
  const d = useDataset();
  const { platforms, query } = useFilters();

  const v = useMemo(() => {
    const rows = listed(d.latest);
    const cells: Cell[] = [];
    platforms.forEach((p) => Array.from(new Set(d.latest.filter((r) => r.platform === p).map((r) => r.city))).sort().forEach((c) => cells.push({ platform: p, city: c, key: `${p}|${c}` })));
    const pids = Array.from(new Set(d.latest.map((r) => r.product_id)));
    const nameOf = (pid: string) => d.latest.find((r) => r.product_id === pid && r.availability !== 'not_listed') ?? d.latest.find((r) => r.product_id === pid)!;
    const skuRows = pids.map((pid) => {
      const st = cells.map((c) => cellStatus(d.latest, c, pid));
      const ref = nameOf(pid);
      return { pid, ref, st, listedN: st.filter((s) => s !== 'not_listed').length, buyN: st.filter((s) => s === 'available').length };
    }).filter((s) => s.listedN > 0);

    // product lines
    const lines = Array.from(new Set(rows.map((r) => r.line))).map((line) => {
      const lr = rows.filter((r) => r.line === line);
      const all = d.latest.filter((r) => r.line === line);
      const priced = lr.filter((r) => r.selling_price !== null);
      return { line, skus: new Set(lr.map((r) => r.product_id)).size, listings: lr.length, buyable: availabilityStats(all).buyablePct, price: round1(avg(priced.map((r) => r.selling_price as number))), disc: round1(avg(priced.map((r) => discountPct(r.mrp, r.selling_price)))), rating: round1(seeded(`${line}|rating`, 4.0, 4.6)) };
    }).sort((a, b) => b.listings - a.listings);
    const unitsByLine = Object.entries(groupSum(d.intervals, (r) => r.line, (r) => r.units)).map(([line, units]) => ({ line, units })).sort((a, b) => b.units - a.units);

    const wide = [...skuRows].sort((a, b) => b.listedN - a.listedN || b.buyN - a.buyN).slice(0, 8);
    const gaps = skuRows.filter((s) => s.listedN < cells.length || s.buyN < s.listedN).sort((a, b) => a.listedN - b.listedN);
    const depth = cells.map((c) => ({ ...c, skus: new Set(rows.filter((r) => r.platform === c.platform && r.city === c.city).map((r) => r.product_id)).size, lineN: new Set(rows.filter((r) => r.platform === c.platform && r.city === c.city).map((r) => r.line)).size }));

    // pack architecture
    const pbCount: Record<string, number> = {};
    rows.forEach((r) => { const b = packBucket(r.pack_size); if (b) pbCount[b] = (pbCount[b] ?? 0) + 1; });
    const pbTotal = Object.values(pbCount).reduce((a, b) => a + b, 0);
    const restRaw = PACK_BUCKETS.map((b) => seeded(`rest|${b}`, 4, 30));
    const restSum = restRaw.reduce((a, b) => a + b, 0);
    const pack = PACK_BUCKETS.flatMap((b, i) => [
      { bucket: b, series: 'Paper Boat', share: pct(pbCount[b] ?? 0, pbTotal) },
      { bucket: b, series: 'Rest of shelf (sample)', share: round1((restRaw[i] / restSum) * 100) },
    ]);

    // feed coverage
    const fields: { key: string; label: string; ok: (r: Snapshot) => boolean }[] = [
      { key: 'price', label: 'Price & MRP', ok: (r) => r.mrp !== null && r.selling_price !== null },
      { key: 'pack', label: 'Readable pack', ok: (r) => packMl(r.pack_size) !== null },
      { key: 'category', label: 'Category', ok: (r) => !!r.category },
      { key: 'shelf', label: 'Shelf life', ok: (r) => r.shelf_life_days !== null },
      { key: 'marketer', label: 'Marketer', ok: (r) => !!r.marketer },
      { key: 'store', label: 'Store address', ok: (r) => !!r.store_address },
      { key: 'url', label: 'Product link', ok: (r) => !!r.url },
    ];
    const feed = platforms.filter((p) => rows.some((r) => r.platform === p)).map((p) => {
      const pr = rows.filter((r) => r.platform === p);
      return { platform: p, n: pr.length, ...Object.fromEntries(fields.map((f) => [f.key, Math.round(pct(pr.filter(f.ok).length, pr.length))])) } as Record<string, number | string>;
    });
    return { rows, cells, lines, unitsByLine, wide, gaps, depth, pack, pbTotal, feed, fields, health: contentHealth(d.latest) };
  }, [d.latest, d.intervals, platforms]);

  const cellLabel = (c: Cell) => `${platformLabel(c.platform)} · ${c.city}`;
  const h = v.health;

  return (
    <TabGate d={d}>
      <div className="bento">
        <Section title="Assortment" sub={`Shelf capture · ${v.cells.length} platform × city cells`} link={<Link href={`/catalogue${query}`}>Catalogue matching →</Link>} />

        <Card className="span-7" title="Product lines" sub="Distribution, availability, price and rating by line" footer={<><Prov>Shelf capture</Prov><Prov kind="sample">Rating · sample</Prov></>}>
          <Table size="small" pagination={false} rowKey="line" dataSource={v.lines} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Line', dataIndex: 'line' },
              { title: 'SKUs', dataIndex: 'skus', align: 'right', sorter: (a, b) => a.skus - b.skus },
              { title: 'Listings', dataIndex: 'listings', align: 'right', sorter: (a, b) => a.listings - b.listings },
              { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (n: number) => <Heat v={Math.round(n)} /> },
              { title: 'Avg price', dataIndex: 'price', align: 'right', render: (n: number) => fmtINR(n) },
              { title: 'Avg discount', dataIndex: 'disc', align: 'right', render: (n: number) => `${n}%` },
              { title: 'Rating', dataIndex: 'rating', align: 'right', render: (n: number) => <span className="muted">{n} ★</span> },
            ]} />
        </Card>

        <Card className="span-5" title="Units by product line" sub="Estimated, selected range" footer={<><EstimateTag /><Prov>Shelf capture</Prov></>}>
          {v.unitsByLine.length ? <BarChart data={v.unitsByLine} x="line" y="units" color="line" height={300} formatter={fmtNum} /> : <EmptyState />}
        </Card>

        <Card className="span-12" title="Widest-distributed SKUs" sub="Product listed across the most platform × city cells · open the live listing on the platform" actions={<Link href={`/catalogue${query}`}><Button size="small">How these were matched</Button></Link>} footer={<Prov>Shelf capture · latest</Prov>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
            {v.wide.map((s) => (
              <div key={s.pid} className="card" style={{ padding: 14, background: 'var(--raised)', boxShadow: 'none' }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, minHeight: 38 }}>{shortName(s.ref.name)}</div>
                <div className="muted" style={{ fontSize: 12 }}>{s.ref.pack_size || '—'} · {s.ref.line}</div>
                <Progress percent={pct(s.listedN, v.cells.length)} size="small" showInfo={false} strokeColor="var(--pb-violet)" />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{s.listedN} of {v.cells.length} cells · {s.buyN} buyable</span>
                  <a href={s.ref.url} target="_blank" rel="noreferrer" aria-label={`Open ${shortName(s.ref.name)} on the platform`}><LinkOutlined /></a>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="span-12" title="Assortment gaps" sub="SKUs listed in some platform × city cells but not listed or out of stock in others" footer={<span>A gap is a SKU the capture did not return in that cell. Confirm it in Catalogue matching before treating it as a delisting.</span>}>
          {v.gaps.length ? (
            <Table size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} rowKey="pid" dataSource={v.gaps} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Product', render: (_, s) => <div><b>{shortName(s.ref.name)}</b><div className="muted" style={{ fontSize: 12 }}>{s.ref.pack_size} · {s.ref.line}</div></div> },
                ...v.cells.map((c, i) => ({ title: cellLabel(c), key: c.key, render: (_: unknown, s: (typeof v.gaps)[number]) => <AvailTag v={s.st[i]} /> })),
                { title: 'Action', render: (_, s) => <Button size="small" onClick={() => message.success(`Raised a listing request for ${shortName(s.ref.name)}`)}>Raise request</Button> },
              ]} />
          ) : <EmptyState text="Every SKU is listed in every cell." />}
        </Card>

        <Card className="span-6" title="Assortment depth" sub="Distinct Paper Boat SKUs listed, platform × city" footer={<Prov>Counted from SKUs observed on the shelf</Prov>}>
          <Table size="small" pagination={false} rowKey="key" dataSource={v.depth}
            columns={[{ title: 'Platform', dataIndex: 'platform', render: platformLabel }, { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> }, { title: 'SKUs', dataIndex: 'skus', align: 'right' }, { title: 'Product lines', dataIndex: 'lineN', align: 'right' }]} />
        </Card>

        <Card className="span-6" title="Pack architecture" sub="Share of listings by pack size — Paper Boat vs the rest of the shelf" footer={<><Prov>Paper Boat · pack size on {v.pbTotal} listings</Prov><Prov kind="sample">Rest of shelf · sample</Prov></>}>
          <ColumnChart data={v.pack} x="bucket" y="share" color="series" height={260} formatter={(n) => `${n}%`} />
        </Card>

        <Card className="span-12" title="What each platform's feed carries" sub="Field coverage on Paper Boat listings" footer={<Prov>Shelf capture · latest</Prov>}>
          <Table size="small" pagination={false} rowKey="platform" dataSource={v.feed} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Platform', dataIndex: 'platform', render: (p: string) => platformLabel(p) },
              { title: 'Listings', dataIndex: 'n', align: 'right' },
              ...v.fields.map((f) => ({ title: f.label, dataIndex: f.key, align: 'right' as const, render: (n: number) => <Heat v={n} /> })),
            ]} />
        </Card>

        <Card className="span-12" title="Listing content health" sub="Defects on the Paper Boat listings themselves — what the brand can fix on the platform" actions={<Link href={`/content-health${query}`}><Button size="small">Open Content &amp; Listing Health</Button></Link>} footer={<><Prov>Computed from the latest capture</Prov><Link href={`/content-health${query}`}>Full fix queue →</Link></>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px', marginBottom: 14 }}>
            {[[h.score, 'content score · weighted'], [`${h.cleanPct}%`, `clean · ${h.clean} of ${h.audited} pass every check`], [h.defects, 'open defects'], ...h.byPlatform.map((p) => [p.score, `score · ${platformLabel(p.platform)}`])].map(([val, l]) => (
              <div key={String(l)}><div className="tnum" style={{ fontSize: 22, fontWeight: 700 }}>{val}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div>
            ))}
          </div>
          <Table size="small" pagination={false} rowKey="key" dataSource={h.checks} columns={[
            { title: 'Check', dataIndex: 'label' },
            { title: 'What it means', dataIndex: 'hint', responsive: ['md'] },
            { title: 'Listings', dataIndex: 'n', align: 'right', render: (n: number) => (n ? <Tag color="orange" bordered={false}>{n}</Tag> : <Tag color="green" bordered={false}>0</Tag>) },
          ]} />
        </Card>
      </div>
    </TabGate>
  );
}
