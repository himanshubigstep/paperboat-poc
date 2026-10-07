'use client';

import { useMemo } from 'react';
import { Progress, Table, Tag } from 'antd';
import { PercentageOutlined, TagsOutlined, FundOutlined, SwapOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { ColumnChart } from '@/components/charts';
import { Card, EmptyState, Kpi, Prov, Section, fmtINR, shortName } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { availabilityStats, avg, discountPct, hasDiscount, round1 } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';
import { DISC_BANDS, discBand, listed, median, per100ml, quantile, rivalBrands, rivalBuyable, rivalDisc, rivalListings, rivalsMedianPer100 } from '@/mock/dashboard-a';
import { RangeRow, TabGate } from './aShared';

const cellTint = (v: number) => ({ background: `color-mix(in srgb, var(--pb-sunset) ${Math.min(60, v * 4)}%, transparent)`, borderRadius: 8, padding: '4px 8px', textAlign: 'center' as const, minWidth: 54 });

export default function PricePromoTab() {
  const d = useDataset();
  const { platforms, cities, query } = useFilters();

  const v = useMemo(() => {
    const rows = listed(d.latest);
    const priced = rows.filter((r) => r.mrp !== null && r.selling_price !== null);
    const plats = platforms.filter((p) => rows.some((r) => r.platform === p));
    const avgDisc = round1(avg(priced.map((r) => discountPct(r.mrp, r.selling_price))));
    const discounted = priced.filter(hasDiscount).length;
    const unit = (rs: Snapshot[]) => rs.map((r) => per100ml(r.selling_price, r.pack_size)).filter((x): x is number => x !== null);
    const pbUnits = unit(rows);
    const pb = { med: median(pbUnits), p25: quantile(pbUnits, 0.25), p75: quantile(pbUnits, 0.75) };

    const perBrand = [
      { brand: 'Paper Boat', ...pb, real: true },
      ...rivalBrands().map((b) => ({ brand: b.brand, med: b.per100, p25: b.per100 * (1 - b.spread / 2), p75: b.per100 * (1 + b.spread / 2), real: false })),
    ].sort((a, b) => b.med - a.med);
    const maxUnit = Math.max(...perBrand.map((b) => b.p75), 1);

    const gap = plats.map((p) => {
      const m = median(unit(rows.filter((r) => r.platform === p)));
      const rv = rivalsMedianPer100(p);
      return { platform: platformLabel(p), gap: round1((m / rv - 1) * 100), pb: round1(m), rivals: rv };
    });

    const bands = plats.flatMap((p) => DISC_BANDS.map((b) => ({ platform: platformLabel(p), band: b, listings: priced.filter((r) => r.platform === p && discBand(r) === b).length })));

    // same pack, same platform, across cities (MRP and price)
    const byPlatSku = new Map<string, Snapshot[]>();
    priced.forEach((r) => { const k = `${r.platform}|${r.product_id}`; (byPlatSku.get(k) ?? byPlatSku.set(k, []).get(k)!).push(r); });
    const mrps = Array.from(byPlatSku.values()).filter((g) => new Set(g.map((r) => r.city)).size > 1).map((g) => {
      const ms = g.map((r) => r.mrp as number);
      const ps = g.map((r) => r.selling_price as number);
      return { key: `${g[0].platform}|${g[0].product_id}`, ref: g[0], g, mrpSpread: Math.max(...ms) - Math.min(...ms), priceSpread: Math.max(...ps) - Math.min(...ps) };
    }).sort((a, b) => b.mrpSpread - a.mrpSpread || b.priceSpread - a.priceSpread);

    // price parity: one pack, every platform × city cell
    const bySku = new Map<string, Snapshot[]>();
    priced.forEach((r) => (bySku.get(r.product_id) ?? bySku.set(r.product_id, []).get(r.product_id)!).push(r));
    const parity = Array.from(bySku.values()).filter((g) => new Set(g.map((r) => `${r.platform}|${r.city}`)).size > 1).map((g) => {
      const s = [...g].sort((a, b) => (a.selling_price as number) - (b.selling_price as number));
      const lo = s[0];
      const hi = s[s.length - 1];
      return { key: g[0].product_id, ref: g[0], lo, hi, spread: round1((((hi.selling_price as number) - (lo.selling_price as number)) / (lo.selling_price as number)) * 100), cells: new Set(g.map((r) => `${r.platform}|${r.city}`)).size };
    }).sort((a, b) => b.spread - a.spread);

    // brands
    const pbBrand = { brand: 'Paper Boat', listings: rows.length, buyable: availabilityStats(d.latest).buyablePct, disc: avgDisc, mrp: round1(avg(priced.map((r) => r.mrp as number))), per100: round1(pb.med), real: true };
    const brands = [pbBrand, ...rivalBrands().map((b) => ({ brand: b.brand, listings: plats.reduce((a, p) => a + rivalListings(b.brand, p), 0), buyable: round1(avg(plats.map((p) => rivalBuyable(b.brand, p)))), disc: round1(avg(plats.map((p) => rivalDisc(b.brand, p)))), mrp: b.mrp, per100: b.per100, real: false }))];
    const totalListings = brands.reduce((a, b) => a + b.listings, 0);
    return { rows, priced, plats, avgDisc, discounted, pb, perBrand, maxUnit, gap, bands, mrps, parity, brands, totalListings };
  }, [d.latest, platforms]);

  const avgGap = v.gap.length ? round1(avg(v.gap.map((g) => g.gap))) : 0;
  const rivalsFor = rivalBrands();

  return (
    <TabGate d={d}>
      <div className="bento">
        <Kpi className="span-3" hero label="Average discount" value={`${v.avgDisc}%`} icon={<PercentageOutlined />} note="mrp vs selling price" />
        <Kpi className="span-3" label="Listings on discount" value={`${v.priced.length ? Math.round((v.discounted / v.priced.length) * 100) : 0}%`} icon={<TagsOutlined />} note={`${v.discounted} of ${v.priced.length}`} />
        <Kpi className="span-3" label="Median ₹ per 100 ml" value={fmtINR(round1(v.pb.med))} icon={<FundOutlined />} note="Paper Boat, from pack size" />
        <Kpi className="span-3" label="Price vs rival brands (sample)" value={`${avgGap > 0 ? '+' : ''}${avgGap}%`} icon={<SwapOutlined />} note={avgGap > 0 ? 'dearer per 100 ml' : 'cheaper per 100 ml'} />

        <Section title="Price & promo" sub="Prices observed on the latest capture" link={<Link href={`/alerts${query}`}>Price rules &amp; subscriptions →</Link>} />

        <Card className="span-7" title="Price per 100 ml by brand" sub="Median of the observed offer price, normalised for pack size" footer={<><Prov>Paper Boat · {v.rows.length} listings</Prov><Prov kind="sample">Rivals · sample</Prov></>}>
          {v.perBrand.map((b) => <RangeRow key={b.brand} label={b.brand} p25={b.p25} p75={b.p75} med={b.med} max={v.maxUnit * 1.05} highlight={b.real} />)}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Marker is the median; the shaded range is the 25th–75th percentile of that brand&apos;s listings.</div>
        </Card>

        <Card className="span-5" title="Price against the brands we track" sub="Paper Boat vs rival median ₹ per 100 ml, per platform (% gap)" footer={<><Prov>Paper Boat · shelf capture</Prov><Prov kind="sample">Rivals · sample</Prov></>}>
          {v.gap.length ? <ColumnChart data={v.gap} x="platform" y="gap" color="platform" height={260} formatter={(n) => `${n}%`} /> : <EmptyState />}
          <div className="muted" style={{ fontSize: 12 }}>{v.gap.map((g) => `${g.platform}: ₹${g.pb} vs ₹${g.rivals}`).join(' · ')}</div>
        </Card>

        <Card className="span-12" title="One pack, one platform, two MRPs" sub={`${v.mrps.filter((m) => m.mrpSpread > 0).length} of ${v.mrps.length} packs carry a different MRP between cities`} footer={<Prov>Shelf capture · latest</Prov>}>
          {v.mrps.length ? (
            <Table size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} rowKey="key" dataSource={v.mrps} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Product', render: (_, m) => <div><b>{shortName(m.ref.name)}</b><div className="muted" style={{ fontSize: 12 }}>{m.ref.pack_size}</div></div> },
                { title: 'Platform', render: (_, m) => platformLabel(m.ref.platform) },
                ...cities.map((c) => ({ title: `${c} MRP / price`, key: c, align: 'right' as const, render: (_: unknown, m: (typeof v.mrps)[number]) => { const r = m.g.find((x) => x.city === c); return r ? `${fmtINR(r.mrp as number)} / ${fmtINR(r.selling_price as number)}` : <span className="muted">—</span>; } })),
                { title: 'MRP gap', dataIndex: 'mrpSpread', align: 'right', sorter: (a, b) => a.mrpSpread - b.mrpSpread, render: (n: number) => (n > 0 ? <Tag color="orange" bordered={false}>{fmtINR(n)}</Tag> : <Tag color="green" bordered={false}>Same</Tag>) },
              ]} />
          ) : <EmptyState text="No pack is listed in more than one city on the same platform." />}
        </Card>

        <Card className="span-6" title="Discount depth" sub="Paper Boat listings by discount band, per platform" footer={<Prov>Discount calculated from MRP and selling price</Prov>}>
          {v.bands.length ? <ColumnChart data={v.bands} x="platform" y="listings" color="band" stack height={280} /> : <EmptyState />}
        </Card>

        <Card className="span-6" title="Average discount, brand × platform" sub="Where competitors are buying the shelf" footer={<><Prov>Paper Boat · shelf capture</Prov><Prov kind="sample">Rivals · sample</Prov><Link href={`/alerts${query}`}>Set a price rule →</Link></>}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
              <thead><tr><th style={{ textAlign: 'left' }} className="muted">Brand</th>{v.plats.map((p) => <th key={p} className="muted">{platformLabel(p)}</th>)}</tr></thead>
              <tbody>
                <tr><td><b>Paper Boat</b></td>{v.plats.map((p) => <td key={p}><div className="tnum" style={cellTint(avg(v.priced.filter((r) => r.platform === p).map((r) => discountPct(r.mrp, r.selling_price))))}>{round1(avg(v.priced.filter((r) => r.platform === p).map((r) => discountPct(r.mrp, r.selling_price))))}%</div></td>)}</tr>
                {rivalsFor.map((b) => <tr key={b.brand}><td>{b.brand}</td>{v.plats.map((p) => <td key={p}><div className="tnum" style={cellTint(rivalDisc(b.brand, p))}>{rivalDisc(b.brand, p)}%</div></td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="span-12" title="Brands on the shelf" sub="Listings, availability, price and discount by brand" footer={<Prov kind="sample">Rival brands are sample data; Paper Boat is from the capture</Prov>}>
          <Table size="small" pagination={false} rowKey="brand" dataSource={v.brands} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Brand', dataIndex: 'brand', render: (b: string, r) => (r.real ? <b>{b}</b> : b) },
              { title: 'Listings', dataIndex: 'listings', align: 'right', sorter: (a, b) => a.listings - b.listings },
              { title: 'Share of shelf', dataIndex: 'listings', width: 160, render: (n: number) => <Progress percent={Math.round((n / (v.totalListings || 1)) * 100)} size="small" strokeColor="var(--pb-violet)" /> },
              { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (n: number) => `${n}%` },
              { title: 'Avg discount', dataIndex: 'disc', align: 'right', sorter: (a, b) => a.disc - b.disc, render: (n: number) => `${n}%` },
              { title: 'Avg MRP', dataIndex: 'mrp', align: 'right', render: (n: number) => fmtINR(n) },
              { title: '₹ / 100 ml', dataIndex: 'per100', align: 'right', render: (n: number) => fmtINR(n) },
            ]} />
        </Card>

        <Card className="span-12" title="Same pack, different platform" sub="Price parity on identical packs across platform × city cells" footer={<Prov>Shelf capture · latest · cheapest vs dearest cell</Prov>}>
          {v.parity.length ? (
            <Table size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} rowKey="key" dataSource={v.parity} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Product', render: (_, p) => <div><b>{shortName(p.ref.name)}</b><div className="muted" style={{ fontSize: 12 }}>{p.ref.pack_size}</div></div> },
                { title: 'Cells', dataIndex: 'cells', align: 'right' },
                { title: 'Cheapest', render: (_, p) => `${fmtINR(p.lo.selling_price as number)} · ${platformLabel(p.lo.platform)} ${p.lo.city}` },
                { title: 'Dearest', render: (_, p) => `${fmtINR(p.hi.selling_price as number)} · ${platformLabel(p.hi.platform)} ${p.hi.city}` },
                { title: 'Spread', dataIndex: 'spread', align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => a.spread - b.spread, render: (n: number) => (n > 0 ? <Tag color={n >= 10 ? 'red' : 'orange'} bordered={false}>{n}%</Tag> : <Tag color="green" bordered={false}>Parity</Tag>) },
              ]} />
          ) : <EmptyState text="No pack is priced in more than one platform × city cell." />}
        </Card>
      </div>
    </TabGate>
  );
}
