'use client';

import { useMemo, useState } from 'react';
import { Button, InputNumber, Modal, Select, Table, Tag, message } from 'antd';
import { Card, PageHead, PlatformTag, Prov, SampleNote, Section } from '@/components/ui';
import { BarChart, ColumnChart } from '@/components/charts';
import { Gate, Tiles } from '@/components/pagekit/Gate';
import { RowsDrawer, type DrawerSpec } from '@/components/pagekit/RowsDrawer';
import { buildMaster } from '@/components/pagekit/catalogue';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { fmtIST } from '@/components/ui';
import { round1, sum } from '@/lib/metrics';
import { buildBrands, buildRatings, type RatedListing } from '@/mock/data-ratings';

const r2 = (n: number) => Math.round(n * 100) / 100;
const wmean = (rs: RatedListing[]) => { const t = sum(rs.map((r) => r.reviews)); return t ? r2(sum(rs.map((r) => r.rating * r.reviews)) / t) : 0; };
const mean = (rs: RatedListing[]) => (rs.length ? r2(sum(rs.map((r) => r.rating)) / rs.length) : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : r2((s[s.length / 2 - 1] + s[s.length / 2]) / 2)) : 0; };
const BANDS: [string, (r: number) => boolean, string][] = [['4.5 and above', (r) => r >= 4.5, 'Strong'], ['4.0 – 4.4', (r) => r >= 4 && r < 4.5, 'Healthy'], ['3.5 – 3.9', (r) => r >= 3.5 && r < 4, 'Watch'], ['Below 3.5', (r) => r < 3.5, 'Quality risk']];

export default function Page() {
  const d = useDataset();
  const { platforms, scopeLabel } = useFilters();
  const [rows, setRows] = useState<DrawerSpec<Record<string, unknown>> | null>(null);
  const [modal, setModal] = useState<null | 'watch' | 'route' | 'review' | 'rule'>(null);
  const [target, setTarget] = useState<RatedListing | null>(null);
  const [gapMin, setGapMin] = useState(0.3);
  const [team, setTeam] = useState('Quality team');
  const [watched, setWatched] = useState(false);
  const [routed, setRouted] = useState<string[]>([]);
  const [ruleBelow, setRuleBelow] = useState(3.8);

  const { skus } = useMemo(() => buildMaster(d.latest), [d.latest]);
  const listings = useMemo(() => buildRatings(skus.map((s) => ({ sku: s.sku, name: s.name, pack: s.pack, line: s.line, platforms: s.platforms, cities: s.cities }))), [skus]);
  const pbMean = mean(listings);
  const pbW = wmean(listings);
  const brands = useMemo(() => buildBrands({ mean: pbMean, weighted: pbW, listings: listings.length, ratings: sum(listings.map((l) => l.reviews)) }, platforms.length), [pbMean, pbW, listings, platforms.length]);
  const rank = brands.findIndex((b) => b.brand === 'Paper Boat') + 1;
  const leader = brands[0];
  const short = (n: string) => n.replace(/^paper boat\s+/i, '');

  const below = listings.filter((l) => pbMean - l.rating >= gapMin).sort((a, b) => a.rating - b.rating);
  const plat = platforms.map((p) => {
    const ls = listings.filter((l) => l.platform === p);
    return { platform: p, mean: mean(ls), weighted: wmean(ls), listings: ls.length, ratings: sum(ls.map((l) => l.reviews)), median: median(ls.map((l) => l.rating)), below: ls.filter((l) => pbMean - l.rating >= gapMin).length, total: skus.filter((s) => s.platforms.includes(p)).length };
  }).filter((p) => p.total);
  const lineRows = Array.from(new Set(listings.map((l) => l.line))).map((line) => {
    const ls = listings.filter((l) => l.line === line);
    return { line, mean: mean(ls), weighted: wmean(ls), listings: ls.length, ratings: sum(ls.map((l) => l.reviews)), below: ls.filter((l) => pbMean - l.rating >= gapMin).length };
  }).sort((a, b) => b.mean - a.mean);
  const hist = Array.from({ length: 9 }, (_, i) => 3.1 + i * 0.2).map((lo) => ({ bucket: `${lo.toFixed(1)}–${(lo + 0.19).toFixed(1)}`, listings: listings.filter((l) => l.rating >= lo - 1e-9 && l.rating < lo + 0.2 - 1e-9).length }));
  const bands = BANDS.map(([label, f, reading]) => { const ls = listings.filter((l) => f(l.rating)); return { label, reading, listings: ls.length, share: listings.length ? `${round1((ls.length / listings.length) * 100)}%` : '0%', ratings: sum(ls.map((l) => l.reviews)) }; });

  const skuAgg = useMemo(() => {
    const m = new Map<string, RatedListing[]>();
    listings.forEach((l) => (m.get(l.sku) ?? m.set(l.sku, []).get(l.sku)!).push(l));
    return Array.from(m.values()).map((ls) => ({ sku: ls[0].sku, name: short(ls[0].name), pack: ls[0].pack, rating: wmean(ls), ratings: sum(ls.map((l) => l.reviews)), listings: ls.length, platforms: ls.length })).filter((s) => s.ratings >= 100);
  }, [listings]);
  const best = [...skuAgg].sort((a, b) => b.rating - a.rating).slice(0, 8);
  const worst = [...skuAgg].sort((a, b) => a.rating - b.rating).slice(0, 8);

  const drawListings = (title: string, ls: RatedListing[]) => setRows({ title, sub: `${ls.length} rated listings`, columns: [{ title: 'Product', dataIndex: 'name' }, { title: 'Pack', dataIndex: 'pack' }, { title: 'Platform', dataIndex: 'platform' }, { title: 'Rating', dataIndex: 'rating', align: 'right' }, { title: 'Ratings', dataIndex: 'reviews', align: 'right' }], rows: ls.map((l) => ({ name: short(l.name), pack: l.pack, platform: platformLabel(l.platform), rating: l.rating, reviews: l.reviews })), note: 'Sample ratings anchored to the SKUs in the capture.' });
  const sampleChip = <Prov kind="sample">Sample data</Prov>;
  const skuCols = [{ title: 'SKU', dataIndex: 'name', render: (v: string, r: { pack: string }) => <div><b>{v}</b><div className="muted" style={{ fontSize: 12 }}>{r.pack}</div></div> }, { title: 'Rating', dataIndex: 'rating', align: 'right' as const }, { title: 'Ratings', dataIndex: 'ratings', align: 'right' as const }, { title: 'Listings', dataIndex: 'listings', align: 'right' as const }, { title: 'Platforms', dataIndex: 'platforms', align: 'right' as const }];

  const confirm = () => {
    if (modal === 'watch') { setWatched(true); message.success(`Watching ${below.length} below-par listings`); }
    if (modal === 'route') { setRouted(below.map((b) => b.key)); message.success(`${below.length} listings routed to ${team}`); }
    if (modal === 'review') { if (target) setRouted((r) => [...r, target.key]); message.success('Review item created'); }
    if (modal === 'rule') message.success(`Rule created: alert when a listing rating falls below ${ruleBelow}`);
    setModal(null);
  };

  return (
    <>
      <PageHead
        title="Ratings & Reviews"
        sub={`Published listing ratings across the Paper Boat shelf · capture ${d.meta ? fmtIST(d.meta.captured_at).split(',')[0] : ''} · ${scopeLabel}`}
        actions={<>
          <Button onClick={() => setModal('watch')}>{watched ? 'Watching below-par listings' : 'Watch below-par listings'}</Button>
          <Button type="primary" onClick={() => setModal('route')}>Route below par to quality</Button>
        </>}
      />
      <Gate d={d}>
        <SampleNote>The capture does not carry ratings yet. Ratings below are sample numbers, anchored to the real SKUs, product lines, platforms and cities in the capture.</SampleNote>
        <Tiles items={[
          { label: 'Paper Boat mean rating', value: pbMean, note: `weighted ${pbW}` },
          { label: 'Rank by mean', value: `#${rank} of ${brands.length}`, note: `leader ${leader.brand} ${leader.mean}` },
          { label: 'Rated listings', value: listings.length, note: `of ${skus.reduce((a, s) => a + s.platforms.length, 0)} SKU × platform` },
          { label: 'Ratings behind it', value: sum(listings.map((l) => l.reviews)).toLocaleString('en-IN') },
          { label: 'Below par', value: below.length, note: `≥ ${gapMin} under the brand mean` },
        ]} />
        <div className="bento">
          <Section title="Where Paper Boat stands" sub="Like for like against every brand with enough rated listings to compare" />
          <Card className="span-4" title="Paper Boat's rank" sub="By mean listing rating" footer={sampleChip}>
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div className="display" style={{ fontSize: 56, fontWeight: 700 }}>#{rank}</div>
              <div className="muted">of {brands.length} brands</div>
              <div style={{ marginTop: 10 }}>{rank === 1 ? 'Paper Boat leads on mean rating.' : `${r2(leader.mean - pbMean)} behind ${leader.brand} (${leader.mean}).`}</div>
            </div>
          </Card>
          <Card className="span-8" title="Mean listing rating by brand" sub="Higher is better" footer={sampleChip}>
            <BarChart data={brands.map((b) => ({ brand: b.brand, mean: b.mean }))} x="brand" y="mean" color="brand" yMin={3.5} yMax={4.8} height={300} />
          </Card>
          <Card className="span-12" title="Brand comparison" sub="Click a brand for its rated listings" footer={sampleChip}>
            <Table size="small" rowKey="brand" pagination={false} scroll={{ x: 'max-content' }} dataSource={brands}
              onRow={(b) => ({ onClick: () => (b.brand === 'Paper Boat' ? drawListings('Paper Boat rated listings', listings) : setRows({ title: `${b.brand} · rated listings`, sub: 'Competitor listing detail is not captured yet', columns: [{ title: 'Measure', dataIndex: 'k' }, { title: 'Value', dataIndex: 'v' }], rows: [{ k: 'Mean rating', v: b.mean }, { k: 'Weighted mean', v: b.weighted }, { k: 'Rated listings', v: b.listings }, { k: 'Ratings', v: b.ratings }] })), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Brand', dataIndex: 'brand', render: (v: string) => (v === 'Paper Boat' ? <b>{v}</b> : v) },
                { title: 'Mean rating', dataIndex: 'mean', align: 'right' },
                { title: 'vs Paper Boat', key: 'vs', align: 'right', render: (_: unknown, b) => (b.brand === 'Paper Boat' ? '—' : <span className={b.mean > pbMean ? 'delta-down' : 'delta-up'}>{b.mean > pbMean ? '+' : ''}{r2(b.mean - pbMean)}</span>) },
                { title: 'Weighted mean', dataIndex: 'weighted', align: 'right' },
                { title: 'Rated listings', dataIndex: 'listings', align: 'right' },
                { title: 'Ratings', dataIndex: 'ratings', align: 'right', render: (v: number) => v.toLocaleString('en-IN') },
                { title: 'Platforms', dataIndex: 'platforms', align: 'right' },
              ]} />
          </Card>

          <Section title="Where the ratings sit" sub="By platform, by product line, and the spread across listings" />
          <Card className="span-6" title="By platform" sub="One rating per listing, published nationally" footer={sampleChip}>
            <Table size="small" rowKey="platform" pagination={false} scroll={{ x: 'max-content' }} dataSource={plat} columns={[
              { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
              { title: 'Mean', dataIndex: 'mean', align: 'right' }, { title: 'Weighted', dataIndex: 'weighted', align: 'right' },
              { title: 'Listings', dataIndex: 'listings', align: 'right' }, { title: 'Ratings', dataIndex: 'ratings', align: 'right', render: (v: number) => v.toLocaleString('en-IN') },
              { title: 'Median', dataIndex: 'median', align: 'right' }, { title: 'Below par', dataIndex: 'below', align: 'right' },
            ]} />
          </Card>
          <Card className="span-6" title="By product line" sub="Line derived from the product name" footer={sampleChip}>
            <Table size="small" rowKey="line" pagination={false} scroll={{ x: 'max-content' }} dataSource={lineRows} columns={[
              { title: 'Product line', dataIndex: 'line' }, { title: 'Mean', dataIndex: 'mean', align: 'right' }, { title: 'Weighted', dataIndex: 'weighted', align: 'right' },
              { title: 'Listings', dataIndex: 'listings', align: 'right' }, { title: 'Ratings', dataIndex: 'ratings', align: 'right', render: (v: number) => v.toLocaleString('en-IN') }, { title: 'Below par', dataIndex: 'below', align: 'right' },
            ]} />
          </Card>
          <Card className="span-7" title="Spread of listing ratings" sub="Distribution of listing means — not a star breakdown" footer={sampleChip}>
            <ColumnChart data={hist} x="bucket" y="listings" height={240} />
          </Card>
          <Card className="span-5" title="Rating bands" sub="Listings counted into each band" footer={sampleChip}>
            <Table size="small" rowKey="label" pagination={false} dataSource={bands} columns={[{ title: 'Band', dataIndex: 'label' }, { title: 'Listings', dataIndex: 'listings', align: 'right' }, { title: 'Share', dataIndex: 'share', align: 'right' }, { title: 'Ratings', dataIndex: 'ratings', align: 'right', render: (v: number) => v.toLocaleString('en-IN') }, { title: 'Reading', dataIndex: 'reading' }]} />
          </Card>
          <Card className="span-12" title="Rating coverage by platform" sub="Paper Boat listings carrying a published rating, and every brand's on the same platforms" footer={sampleChip}>
            <Table size="small" rowKey="platform" pagination={false} scroll={{ x: 'max-content' }} dataSource={plat} columns={[
              { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
              { title: 'PB listings', dataIndex: 'total', align: 'right' }, { title: 'Rated', dataIndex: 'listings', align: 'right' },
              { title: 'Coverage', key: 'c', align: 'right', render: (_: unknown, p) => `${round1((p.listings / p.total) * 100)}%` },
              { title: 'Whole shelf rated', key: 'w', align: 'right', render: (_: unknown, p) => `${Math.min(100, round1((p.listings / p.total) * 100 + 3))}%` },
            ]} />
          </Card>

          <Section title="Best and worst rated SKUs" sub="Review-weighted across every listing of the SKU" />
          <Card className="span-6" title="Best rated SKUs" sub="SKUs with at least 100 ratings" footer={sampleChip}><Table size="small" rowKey="sku" pagination={false} dataSource={best} columns={skuCols} scroll={{ x: 'max-content' }} /></Card>
          <Card className="span-6" title="Lowest rated SKUs" sub="SKUs with at least 100 ratings" footer={sampleChip}><Table size="small" rowKey="sku" pagination={false} dataSource={worst} columns={skuCols} scroll={{ x: 'max-content' }} /></Card>

          <Section title="Below par — route to quality" sub={`${below.length} listings at least ${gapMin} under the brand mean of ${pbMean}`} />
          <Card className="span-12" title="Listings materially below the brand mean" sub="Gap = brand mean minus listing rating" actions={<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className="muted" style={{ fontSize: 12 }}>Gap ≥</span><InputNumber size="small" min={0.1} max={1.5} step={0.1} value={gapMin} onChange={(v) => setGapMin(v ?? 0.3)} aria-label="Minimum gap" /><Button size="small" onClick={() => setModal('rule')}>Create rule</Button></div>} footer={sampleChip}>
            <Table size="small" rowKey="key" pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} dataSource={below} locale={{ emptyText: 'No listing is that far below the brand mean' }} columns={[
              { title: 'Product', dataIndex: 'name', render: (v: string, l) => <div><b>{short(v)}</b><div className="muted" style={{ fontSize: 12 }}>{l.pack}</div></div> },
              { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
              { title: 'Line', dataIndex: 'line' }, { title: 'Rating', dataIndex: 'rating', align: 'right' },
              { title: 'Ratings', dataIndex: 'reviews', align: 'right' },
              { title: 'Gap', key: 'g', align: 'right', render: (_: unknown, l) => <span className="delta-down">−{r2(pbMean - l.rating)}</span> },
              { title: 'Cities', dataIndex: 'cities', render: (v: string[]) => v.map((c) => <Tag key={c} bordered={false}>{c}</Tag>) },
              { title: 'Action', key: 'a', render: (_: unknown, l) => (routed.includes(l.key) ? <Tag color="success" bordered={false}>Routed</Tag> : <Button size="small" onClick={() => { setTarget(l); setModal('review'); }}>Create review item</Button>) },
            ]} />
          </Card>
        </div>
      </Gate>
      <RowsDrawer spec={rows} onClose={() => setRows(null)} />
      <Modal open={!!modal} onCancel={() => setModal(null)} onOk={confirm} okText={modal === 'watch' ? 'Watch' : modal === 'route' ? 'Route' : modal === 'review' ? 'Create review item' : 'Create rule'} title={modal === 'watch' ? 'Watch below-par listings' : modal === 'route' ? 'Route below par to quality' : modal === 'review' ? 'Create review item' : 'Create rule'}>
        {modal === 'watch' && <p>Track {below.length} listings that sit {gapMin} or more under the brand mean. You will be alerted when a rating moves.</p>}
        {modal === 'route' && <><p>{below.length} below-par listings will go to:</p><Select value={team} onChange={setTeam} aria-label="Team" style={{ width: '100%' }} options={['Quality team', 'Category team', 'Platform account manager'].map((v) => ({ value: v, label: v }))} /></>}
        {modal === 'review' && target && <p>Open a review item for <b>{short(target.name)} {target.pack}</b> on {platformLabel(target.platform)} (rating {target.rating}, {r2(pbMean - target.rating)} under the brand mean).</p>}
        {modal === 'rule' && <><p>Alert when a Paper Boat listing rating falls below:</p><InputNumber min={1} max={5} step={0.1} value={ruleBelow} onChange={(v) => setRuleBelow(v ?? 3.8)} aria-label="Threshold" /></>}
        <div style={{ marginTop: 8 }}>{sampleChip}</div>
      </Modal>
    </>
  );
}
