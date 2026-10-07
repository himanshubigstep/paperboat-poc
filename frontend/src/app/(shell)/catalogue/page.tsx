'use client';

import { useMemo, useState } from 'react';
import { Button, Modal, Progress, Radio, Switch, Table, Tag, message } from 'antd';
import { Card, PageHead, PlatformTag, Prov, Section, UrlTabs, shortName } from '@/components/ui';
import { BarChart, DonutChart } from '@/components/charts';
import { Gate, Tiles } from '@/components/pagekit/Gate';
import { RowsDrawer, snapshotColumns, type DrawerSpec } from '@/components/pagekit/RowsDrawer';
import { buildMaster, isUntitled, findDuplicates, findPackConflicts, type DupePair, type PackConflict, type SkuGroup } from '@/components/pagekit/catalogue';
import { downloadCsv } from '@/components/pagekit/csv';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { hash } from '@/mock/data-util';
import { RECHECK_SPLIT, rivalBrandRows, rivalByPlatform } from '@/mock/data-catalogue';
import type { Snapshot } from '@/lib/types';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
type Decision = 'accepted' | 'rejected' | 'skipped';

interface UItem { row: Snapshot; candidates: { sku: SkuGroup; conf: number; why: string }[] }

export default function Page() {
  const d = useDataset();
  const { platforms, scopeLabel } = useFilters();
  const [rows, setRows] = useState<DrawerSpec<Snapshot> | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [dec, setDec] = useState<Record<string, Decision>>({});
  const [accept, setAccept] = useState<{ item: UItem; sku: SkuGroup } | null>(null);
  const [dupDec, setDupDec] = useState<Record<string, 'merged' | 'not'>>({});
  const [hideShared, setHideShared] = useState(false);
  const [mergeFor, setMergeFor] = useState<DupePair | null>(null);
  const [resolve, setResolve] = useState<PackConflict | null>(null);
  const [way, setWay] = useState<'master' | 'split'>('split');
  const [packDec, setPackDec] = useState<Record<string, string>>({});

  const { skus, unmatched } = useMemo(() => buildMaster(d.latest), [d.latest]);
  const dupes = useMemo(() => findDuplicates(skus), [skus]);
  const packs = useMemo(() => findPackConflicts(skus), [skus]);

  const queue: UItem[] = useMemo(() => unmatched.map((row) => {
    // the same platform id may carry a title elsewhere in the capture history
    const named = d.all.find((s) => s.product_id === row.product_id && !isUntitled(s));
    const own = named ? skus.find((s) => s.ids.some((i) => i.product_id === row.product_id)) : undefined;
    const cands: UItem['candidates'] = [];
    if (own) cands.push({ sku: own, conf: 0.97, why: `Same platform id ${row.product_id} is titled “${shortName(own.name)}” in ${own.ids.find((i) => i.product_id === row.product_id)?.city}` });
    const h = hash(`${row.platform}|${row.product_id}`);
    [skus[h % Math.max(1, skus.length)], skus[(h >> 3) % Math.max(1, skus.length)]].filter(Boolean).forEach((s, i) => { if (!cands.some((c) => c.sku.sku === s.sku)) cands.push({ sku: s, conf: Math.round((0.52 - i * 0.12) * 100) / 100, why: 'Nearest by id range and category (sample suggestion)' }); });
    return { row, candidates: cands };
  }), [unmatched, d.all, skus]);

  const open = queue.filter((q) => !dec[q.row.product_id + q.row.city] || dec[q.row.product_id + q.row.city] === 'skipped');
  const acceptedN = Object.values(dec).filter((v) => v === 'accepted').length;
  const matched = d.latest.length - unmatched.length + acceptedN;
  const cov = platforms.map((p) => {
    const rs = d.latest.filter((r) => r.platform === p);
    const um = rs.filter((r) => isUntitled(r) && dec[r.product_id + r.city] !== 'accepted');
    const caps = d.snapshots.filter((r) => r.platform === p);
    const capsMatched = caps.filter((r) => !isUntitled(r)).length;
    return { platform: p, listings: rs.length, unmatched: um.length, matched: rs.length - um.length, rows: caps.length, rowsMatched: capsMatched };
  }).filter((x) => x.listings);

  const bands = useMemo(() => {
    const verified = skus.filter((s) => s.rows.length >= 2 && s.names.length === 1);
    const high = skus.filter((s) => s.rows.length === 1 && s.names.length === 1);
    const norm = skus.filter((s) => s.names.length > 1);
    return [
      { band: 'Verified', what: 'Same title and pack seen in more than one store or city', skus: verified.length, rows: sum(verified.map((s) => s.rows.length)), method: 'Exact title + pack' },
      { band: 'High', what: 'Exact title and pack in a single listing', skus: high.length, rows: sum(high.map((s) => s.rows.length)), method: 'Exact title + pack' },
      { band: 'Normalised', what: 'Titles differ only in spacing, slashes or “+”', skus: norm.length, rows: sum(norm.map((s) => s.rows.length)), method: 'Normalised title + pack' },
    ];
  }, [skus]);

  const recheck = RECHECK_SPLIT.map((r) => ({ ...r, rows: Math.round(matched * r.share) }));
  const rival = rivalByPlatform(platforms, (p) => d.latest.filter((r) => r.platform === p && r.availability !== 'not_listed').length);
  const rivalBrands = rivalBrandRows(platforms.length);

  const crosswalk = skus.flatMap((s) => s.ids.map((i) => ({ sku: s.sku, canonical_name: s.name, pack: s.pack, platform: i.platform, city: i.city, platform_product_id: i.product_id, state: i.availability })));
  const dupShown = dupes.filter((p) => !hideShared || !p.a.platforms.some((x) => p.b.platforms.includes(x)));

  return (
    <>
      <PageHead title="Catalogue Matching" sub="Every captured listing tied to a Paper Boat SKU — and what is not tied yet" actions={<Button onClick={() => setExportOpen(true)}>Export crosswalk</Button>} />
      <Gate d={d}>
        <Tiles items={[
          { label: 'Listings matched', value: `${pct(matched, d.latest.length)}%`, note: `${matched} of ${d.latest.length}` },
          { label: 'Canonical SKUs', value: skus.length, note: 'distinct title × pack' },
          { label: 'Unmatched', value: open.length, note: 'in the review queue' },
          { label: 'Duplicate pairs', value: dupes.length - Object.keys(dupDec).filter((k) => dupDec[k]).length, note: 'one product, two ids' },
          { label: 'Pack conflicts', value: packs.length - Object.keys(packDec).length, note: 'master vs observed' },
        ]} />
        <UrlTabs defaultKey="cov" items={[
          { key: 'cov', label: 'Coverage & confidence', children: (
            <div className="bento">
              <Section title="Coverage" sub={`Every Paper Boat listing in the latest capture · ${scopeLabel}`} />
              <Card className="span-7" title="Coverage by platform" sub="Listings carrying a canonical SKU id" footer={<Prov>Shelf capture · latest</Prov>}>
                <Table size="small" rowKey="platform" pagination={false} scroll={{ x: 'max-content' }} dataSource={cov} columns={[
                  { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
                  { title: 'Listings', dataIndex: 'listings', align: 'right' }, { title: 'Unmatched', dataIndex: 'unmatched', align: 'right' },
                  { title: 'Listings matched', key: 'm', render: (_: unknown, r) => <Progress size="small" percent={pct(r.matched, r.listings)} /> },
                  { title: 'Captured rows', dataIndex: 'rows', align: 'right' },
                  { title: 'Rows matched', key: 'rm', align: 'right', render: (_: unknown, r) => `${pct(r.rowsMatched, r.rows)}%` },
                ]} />
              </Card>
              <Card className="span-5" title="Matched and unmatched listings" sub="Distinct platform listings per platform" footer={<Prov>Shelf capture · latest</Prov>}>
                <BarChart stack data={cov.flatMap((c) => [{ platform: platformLabel(c.platform), kind: 'Matched', n: c.matched }, { platform: platformLabel(c.platform), kind: 'Unmatched', n: c.unmatched }])} x="platform" y="n" color="kind" height={220} />
              </Card>
              <Section title="Confidence bands" sub="What kind of evidence stands behind each SKU-to-listing link" />
              <Card className="span-8" title="Bands" sub="Assigned per canonical SKU, then counted over its captured rows" footer={<Prov>Derived from the capture</Prov>}>
                <Table size="small" rowKey="band" pagination={false} scroll={{ x: 'max-content' }} dataSource={bands} columns={[
                  { title: 'Band', dataIndex: 'band', render: (v: string) => <Tag bordered={false} color={v === 'Verified' ? 'success' : v === 'High' ? 'processing' : 'warning'}>{v}</Tag> },
                  { title: 'What that means', dataIndex: 'what' }, { title: 'SKUs', dataIndex: 'skus', align: 'right' }, { title: 'Captured rows', dataIndex: 'rows', align: 'right' },
                ]} />
              </Card>
              <Card className="span-4" title="Evidence behind a link" sub="SKUs per band, and the link method recorded" footer={<Prov>Derived from the capture</Prov>}>
                <DonutChart data={bands.map((b) => ({ band: b.band, skus: b.skus }))} angle="skus" color="band" height={200} />
                <Table size="small" rowKey="m" pagination={false} dataSource={[{ m: 'Exact title + pack', n: bands[0].skus + bands[1].skus }, { m: 'Normalised title + pack', n: bands[2].skus }]} columns={[{ title: 'Link method', dataIndex: 'm' }, { title: 'SKUs', dataIndex: 'n', align: 'right' }]} />
              </Card>
              <Section title="The independent re-check" sub="Every matched listing re-matched blind, then compared with the SKU it already carries" />
              <Card className="span-12" title="Blind re-match agreement" sub={`${matched} matched listings re-matched`} footer={<Prov kind="sample">Sample data — the blind re-match is not run on the capture</Prov>}>
                <Table size="small" rowKey="outcome" pagination={false} scroll={{ x: 'max-content' }} dataSource={recheck} columns={[
                  { title: 'Outcome', dataIndex: 'outcome' }, { title: 'Rows', dataIndex: 'rows', align: 'right' },
                  { title: 'Share', dataIndex: 'share', align: 'right', render: (v: number) => `${Math.round(v * 1000) / 10}%` }, { title: 'Reading', dataIndex: 'reading' },
                ]} />
              </Card>
            </div>
          ) },
          { key: 'q', label: `Review queue (${open.length + dupShown.filter((p) => !dupDec[p.id]).length + packs.filter((p) => !packDec[p.id]).length})`, children: (
            <div className="bento">
              <Section title="Unmatched listings" sub="A listing not yet tied to a canonical SKU — its rows stay out of every SKU-level number" />
              <Card className="span-12" title="Unmatched queue" sub={`${open.length} of ${queue.length} listing ids need a decision`} footer={<><Prov>Unmatched ids from the capture</Prov><Prov kind="sample">Low-confidence suggestions are sample</Prov></>}>
                {!open.length && <div className="muted">The queue is clear.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {open.map((it) => {
                    const k = it.row.product_id + it.row.city;
                    return (
                      <div key={k} style={{ padding: 12, borderRadius: 14, background: 'var(--raised)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ minWidth: 190 }}>
                          <b>Platform id {it.row.product_id}</b> <Tag bordered={false}>{it.row.availability === 'not_listed' ? 'Not listed' : it.row.availability}</Tag>
                          <div className="muted" style={{ fontSize: 12 }}>{platformLabel(it.row.platform)} · {it.row.city} · no title, pack or category</div>
                          {dec[k] === 'skipped' && <Tag bordered={false}>Skipped</Tag>}
                        </div>
                        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {it.candidates.map((c) => (
                            <div key={c.sku.sku} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Tag color={c.conf >= 0.9 ? 'success' : 'default'} bordered={false}>{Math.round(c.conf * 100)}%</Tag>
                              <span style={{ flex: 1, minWidth: 160 }}>{shortName(c.sku.name)} · {c.sku.pack}<div className="muted" style={{ fontSize: 11.5 }}>{c.why}</div></span>
                              <Button size="small" type={c.conf >= 0.9 ? 'primary' : 'default'} onClick={() => setAccept({ item: it, sku: c.sku })}>Accept</Button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button size="small" onClick={() => { setDec((x) => ({ ...x, [k]: 'rejected' })); message.success('Candidates rejected — the id stays unmatched'); }}>Reject all</Button>
                          <Button size="small" onClick={() => { setDec((x) => ({ ...x, [k]: 'skipped' })); message.info('Skipped for now'); }}>Skip</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Section title="Duplicate canonical SKUs" sub="Two ids that look like one product — merging them re-joins their platform count" />
              <Card className="span-12" title="One product held under two ids" sub={`${dupShown.length} pair${dupShown.length === 1 ? '' : 's'} where the same words are written differently`} actions={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="muted" style={{ fontSize: 12 }}>Hide pairs that share a platform</span><Switch size="small" checked={hideShared} onChange={setHideShared} aria-label="Hide pairs that share a platform" /></span>} footer={<Prov>Title normalisation on the capture</Prov>}>
                {!dupShown.length && <div className="muted">No pairs to show.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
                  {dupShown.map((p) => (
                    <div key={p.id} style={{ padding: 12, borderRadius: 14, background: 'var(--raised)' }}>
                      {[p.a, p.b].map((s) => <div key={s.sku}><b>{shortName(s.name)}</b> <span className="muted">· {s.pack} · ids {s.ids.map((i) => i.product_id).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span></div>)}
                      <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>{p.why}{p.a.pack !== p.b.pack ? ` · packs differ (${p.a.pack} vs ${p.b.pack}) so merging needs a pack check` : ''}</div>
                      {dupDec[p.id] ? <Tag color={dupDec[p.id] === 'merged' ? 'success' : 'default'} bordered={false}>{dupDec[p.id] === 'merged' ? 'Merged' : 'Kept separate'}</Tag> : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button size="small" type="primary" onClick={() => setMergeFor(p)}>Merge</Button>
                          <Button size="small" onClick={() => { setDupDec((x) => ({ ...x, [p.id]: 'not' })); message.success('Marked as not a duplicate'); }}>Not a duplicate</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
              <Section title="Pack conflicts" sub="A listing whose pack size contradicts the master pack" />
              <Card className="span-12" title="Master pack against what was observed" sub={`${packs.length} SKUs share a title with a different pack`} footer={<Prov>Pack parsing on the capture</Prov>}>
                <Table size="small" rowKey="id" pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} dataSource={packs} columns={[
                  { title: 'SKU', key: 's', render: (_: unknown, p) => <code>{p.observed.sku}</code> },
                  { title: 'Canonical name', key: 'n', render: (_: unknown, p) => shortName(p.master.name) },
                  { title: 'Master pack', key: 'm', render: (_: unknown, p) => p.master.pack }, { title: 'Observed pack', key: 'o', render: (_: unknown, p) => p.observed.pack },
                  { title: 'Parsed size', key: 'ps', align: 'right', render: (_: unknown, p) => (p.parsedMl ? `${p.parsedMl} ml` : '—') },
                  { title: 'Rows', key: 'r', align: 'right', render: (_: unknown, p) => p.observed.rows.length },
                  { title: 'Platforms', key: 'pl', render: (_: unknown, p) => p.observed.platforms.map(platformLabel).join(', ') },
                  { title: 'Kind', key: 'k', render: (_: unknown, p) => <Tag bordered={false}>{p.kind === 'multipack' ? 'Multipack of master' : 'Different size'}</Tag> },
                  { title: '', key: 'a', render: (_: unknown, p) => (packDec[p.id] ? <Tag color="success" bordered={false}>{packDec[p.id]}</Tag> : <Button size="small" onClick={() => { setResolve(p); setWay(p.kind === 'multipack' ? 'split' : 'master'); }}>Resolve</Button>) },
                ]} />
              </Card>
            </div>
          ) },
          { key: 'riv', label: 'Rival matching', children: (
            <div className="bento">
              <Section title="Rival matching" sub="A rival price is only readable when a comparable Paper Boat pack sits on the same platform" />
              <Card className="span-7" title="Comparable benchmark rows by platform" sub="Rival rows with a comparable Paper Boat pack on the same platform" footer={<Prov kind="sample">Sample data</Prov>}>
                <Table size="small" rowKey="platform" pagination={false} scroll={{ x: 'max-content' }} dataSource={rival} columns={[
                  { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> }, { title: 'Benchmark rows', dataIndex: 'rows', align: 'right' },
                  { title: 'Comparable', dataIndex: 'comparable', align: 'right' }, { title: 'Share', dataIndex: 'share', align: 'right', render: (v: number) => `${v}%` },
                  { title: 'Paper Boat listed', dataIndex: 'pbListed', align: 'right' },
                ]} />
              </Card>
              <Card className="span-5" title="Comparable share" sub="Share of rival rows that can be compared" footer={<Prov kind="sample">Sample data</Prov>}>
                <BarChart data={rival.map((r) => ({ platform: platformLabel(r.platform), share: r.share }))} x="platform" y="share" color="platform" yMin={0} yMax={100} height={200} formatter={(v) => `${v}%`} />
              </Card>
              <Card className="span-12" title="Brands" sub="Rival brands tracked for comparison" footer={<Prov kind="sample">Sample data</Prov>}>
                <Table size="small" rowKey="brand" pagination={false} scroll={{ x: 'max-content' }} dataSource={rivalBrands} columns={[{ title: 'Brand', dataIndex: 'brand' }, { title: 'Benchmark rows', dataIndex: 'rows', align: 'right' }, { title: 'Comparable', dataIndex: 'comparable', align: 'right' }, { title: 'Share', dataIndex: 'share', align: 'right', render: (v: number) => `${v}%` }]} />
              </Card>
            </div>
          ) },
        ]} />
      </Gate>

      <RowsDrawer spec={rows} onClose={() => setRows(null)} />

      <Modal open={exportOpen} title="Export crosswalk" onCancel={() => setExportOpen(false)} okText="Download CSV" onOk={() => { downloadCsv('catalogue-crosswalk.csv', crosswalk); message.success(`${crosswalk.length} crosswalk rows downloaded`); setExportOpen(false); }} width={720}>
        <p className="muted">One row per canonical SKU × platform id — {crosswalk.length} rows. {unmatched.length} unmatched ids are excluded.</p>
        <Table size="small" rowKey={(r) => `${r.sku}${r.city}${r.platform_product_id}`} pagination={{ pageSize: 6 }} dataSource={crosswalk} scroll={{ x: 'max-content' }} columns={Object.keys(crosswalk[0] ?? {}).map((k) => ({ title: k, dataIndex: k }))} />
      </Modal>
      <Modal open={!!accept} title="Write the link" okText="Write the link" onCancel={() => setAccept(null)} onOk={() => { if (accept) { setDec((x) => ({ ...x, [accept.item.row.product_id + accept.item.row.city]: 'accepted' })); message.success(`Platform id ${accept.item.row.product_id} linked to ${accept.sku.sku}`); } setAccept(null); }}>
        {accept && <><p><b>What would be written</b></p><p>Platform id <code>{accept.item.row.product_id}</code> ({platformLabel(accept.item.row.platform)} · {accept.item.row.city}) → canonical SKU <code>{accept.sku.sku}</code> “{shortName(accept.sku.name)} {accept.sku.pack}”.</p><p className="muted">Its rows then count in every SKU-level number.</p></>}
      </Modal>
      <Modal open={!!mergeFor} title="Merge" okText="Merge" onCancel={() => setMergeFor(null)} onOk={() => { if (mergeFor) { setDupDec((x) => ({ ...x, [mergeFor.id]: 'merged' })); message.success(`${mergeFor.b.sku} merged into ${mergeFor.a.sku}`); } setMergeFor(null); }}>
        {mergeFor && <><p><b>What would happen</b></p><p><code>{mergeFor.b.sku}</code> “{shortName(mergeFor.b.name)}” is folded into <code>{mergeFor.a.sku}</code> “{shortName(mergeFor.a.name)}”; platform ids {mergeFor.b.ids.map((i) => i.product_id).join(', ')} keep their link.</p>{mergeFor.a.pack !== mergeFor.b.pack && <Tag color="warning">The packs differ ({mergeFor.a.pack} vs {mergeFor.b.pack}) — check before merging.</Tag>}</>}
      </Modal>
      <Modal open={!!resolve} title="Resolve pack conflict" okText="Resolve" onCancel={() => setResolve(null)} onOk={() => { if (resolve) { setPackDec((x) => ({ ...x, [resolve.id]: way === 'master' ? 'Master corrected' : 'Split to new SKU' })); message.success(way === 'master' ? 'Master pack corrected' : 'Split to a new SKU'); } setResolve(null); }}>
        {resolve && <><p>Master is <b>{resolve.master.pack}</b>, observed <b>{resolve.observed.pack}</b> on {resolve.observed.rows.length} row(s).</p><p><b>Two ways out</b></p>
          <Radio.Group value={way} onChange={(e) => setWay(e.target.value)}>
            <Radio value="master" style={{ display: 'block' }}>Correct the master — the master pack becomes {resolve.observed.pack}</Radio>
            <Radio value="split" style={{ display: 'block' }}>Split to a new SKU — keep the master, create a SKU for {resolve.observed.pack}</Radio>
          </Radio.Group>
          <Button style={{ marginTop: 10 }} size="small" onClick={() => setRows({ title: `${resolve.observed.sku} rows`, sub: 'The listing rows behind the observed pack', columns: snapshotColumns, rows: resolve.observed.rows, rowKey: (r) => `${r.city}${r.product_id}` })}>View rows</Button></>}
      </Modal>
    </>
  );
}
