'use client';

import { useMemo, useState } from 'react';
import { Button, Drawer, Modal, Segmented, Select, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Card, PageHead, PlatformTag, Prov, Section, shortName } from '@/components/ui';
import { BarChart, ColumnChart } from '@/components/charts';
import { Gate, Tiles } from '@/components/pagekit/Gate';
import { RowsDrawer, snapshotColumns, type DrawerSpec } from '@/components/pagekit/RowsDrawer';
import { CHECK, CHECKS, isUntitled, runChecks, scoreOf, skuKeyOf, type Defect } from '@/components/pagekit/catalogue';
import { downloadCsv } from '@/components/pagekit/csv';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { round1, sum } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';

interface QItem {
  key: string;
  name: string;
  pack: string;
  platform: string;
  line: string;
  cities: string[];
  defects: Defect[];
  checks: string[];
  score: number;
  rows: Snapshot[];
}

const scoreTag = (s: number) => <Tag bordered={false} color={s >= 90 ? 'success' : s >= 70 ? 'warning' : 'error'}>{s}</Tag>;
const OWNERS = ['Catalogue team', 'Category team', 'Pricing', 'Platform account manager', 'Supply chain'];

export default function Page() {
  const d = useDataset();
  const { platforms, scopeLabel } = useFilters();
  const [fPlat, setFPlat] = useState<string>('all');
  const [fCheck, setFCheck] = useState<string>('all');
  const [fLine, setFLine] = useState<string>('all');
  const [heavy, setHeavy] = useState(false);
  const [rows, setRows] = useState<DrawerSpec<Snapshot> | null>(null);
  const [prep, setPrep] = useState<QItem | null>(null);
  const [owner, setOwner] = useState(OWNERS[0]);
  const [routeOpen, setRouteOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [filed, setFiled] = useState<string[]>([]);

  const defects = useMemo(() => runChecks(d.latest), [d.latest]);
  const listed = useMemo(() => d.latest.filter((r) => r.availability !== 'not_listed' || isUntitled(r)), [d.latest]);

  const queue: QItem[] = useMemo(() => {
    const m = new Map<string, QItem>();
    for (const x of defects) {
      const k = `${skuKeyOf(x.row)}|${x.row.platform}|${isUntitled(x.row) ? x.row.product_id : ''}`;
      let it = m.get(k);
      if (!it) {
        it = { key: k, name: isUntitled(x.row) ? '' : x.row.name, pack: x.row.pack_size, platform: x.row.platform, line: isUntitled(x.row) ? 'Unmatched ids' : x.row.line, cities: [], defects: [], checks: [], score: 100, rows: [] };
        m.set(k, it);
      }
      if (!it.cities.includes(x.row.city)) it.cities.push(x.row.city);
      if (!it.rows.includes(x.row)) it.rows.push(x.row);
      it.defects.push(x);
    }
    const out = Array.from(m.values());
    out.forEach((it) => {
      it.checks = Array.from(new Set(it.defects.map((x) => x.checkId)));
      // score of one listing: unique checks across the SKU×platform
      it.score = Math.max(0, 100 - sum(it.checks.map((c) => CHECK[c].weight)));
    });
    return out.sort((a, b) => a.score - b.score || b.cities.length - a.cities.length);
  }, [defects]);

  const lines = Array.from(new Set(queue.map((q) => q.line))).sort();
  const shownQ = queue.filter((q) => (fPlat === 'all' || q.platform === fPlat) && (fCheck === 'all' || q.checks.includes(fCheck)) && (fLine === 'all' || q.line === fLine) && (!heavy || q.score < 70));

  const openRows = (title: string, sub: string, data: Snapshot[]) => setRows({ title, sub, columns: snapshotColumns, rows: data, rowKey: (r) => `${r.platform}${r.city}${r.product_id}` });

  // per-listing scores
  const listingScore = useMemo(() => {
    const m = new Map<Snapshot, Defect[]>();
    defects.forEach((x) => (m.get(x.row) ?? m.set(x.row, []).get(x.row)!).push(x));
    return (r: Snapshot) => scoreOf(m.get(r) ?? []);
  }, [defects]);

  const byCheck = CHECKS.map((c) => {
    const ds = defects.filter((x) => x.checkId === c.id);
    return { ...c, listings: ds.length, skus: new Set(ds.map((x) => skuKeyOf(x.row))).size, rows: ds.map((x) => x.row) };
  });

  const platStats = platforms.map((p) => {
    const rs = d.latest.filter((r) => r.platform === p);
    const ls = rs.filter((r) => r.availability !== 'not_listed');
    const ds = defects.filter((x) => x.row.platform === p);
    const dirty = new Set(ds.map((x) => x.row)).size;
    const mix = CHECKS.map((c) => ({ id: c.id, n: ds.filter((x) => x.checkId === c.id).length })).filter((x) => x.n);
    const pct = (f: (r: Snapshot) => boolean) => (ls.length ? Math.round((ls.filter(f).length / ls.length) * 100) : 0);
    return {
      platform: p, listings: rs.length, clean: rs.length - dirty, defects: ds.length, mix,
      score: ls.length ? round1(ls.reduce((a, r) => a + listingScore(r), 0) / ls.length) : 0,
      cov: { Pack: pct((r) => !!r.pack_size), Category: pct((r) => !!r.category), MRP: pct((r) => r.mrp !== null), 'Shelf life': pct((r) => r.shelf_life_days !== null), Marketer: pct((r) => !!r.marketer) },
      rows: rs,
    };
  }).filter((x) => x.listings);

  const lineStats = Array.from(new Set(d.latest.map((r) => (isUntitled(r) ? 'Unmatched ids' : r.line)))).map((l) => {
    const rs = d.latest.filter((r) => (isUntitled(r) ? 'Unmatched ids' : r.line) === l);
    const ds = defects.filter((x) => (isUntitled(x.row) ? 'Unmatched ids' : x.row.line) === l);
    const ls = rs.filter((r) => r.availability !== 'not_listed');
    return { line: l, listings: rs.length, skus: new Set(rs.map(skuKeyOf)).size, defects: ds.length, per100: rs.length ? round1((ds.length / rs.length) * 100) : 0, score: ls.length ? round1(ls.reduce((a, r) => a + listingScore(r), 0) / ls.length) : 0, rows: rs };
  }).sort((a, b) => b.per100 - a.per100);

  const avgScore = listed.length ? round1(d.latest.reduce((a, r) => a + listingScore(r), 0) / d.latest.length) : 0;
  const defective = new Set(defects.map((x) => x.row)).size;

  const batches = useMemo(() => {
    const m = new Map<string, { platform: string; check: string; items: number }>();
    shownQ.forEach((q) => q.checks.forEach((c) => { const k = `${q.platform}|${c}`; const b = m.get(k) ?? { platform: q.platform, check: c, items: 0 }; b.items += 1; m.set(k, b); }));
    return Array.from(m.values()).sort((a, b) => b.items - a.items);
  }, [shownQ]);

  const qCols: ColumnsType<QItem> = [
    { title: 'Product', key: 'p', render: (_: unknown, q) => <div><b>{q.name ? shortName(q.name) : 'No title'}</b><div className="muted" style={{ fontSize: 12 }}>{q.pack || '—'} · {q.line}{q.name ? '' : ` · id ${q.rows[0].product_id}`}</div></div> },
    { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
    { title: 'Repeats in', dataIndex: 'cities', render: (v: string[]) => v.join(', ') },
    { title: 'Failed checks', dataIndex: 'checks', render: (v: string[]) => <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{v.map((c) => <Tag key={c} bordered={false}>{CHECK[c].label}</Tag>)}</div> },
    { title: 'What the capture sees', key: 's', render: (_: unknown, q) => <span className="muted" style={{ fontSize: 12.5 }}>{q.defects[0].seen}</span> },
    { title: 'Score', dataIndex: 'score', align: 'right', sorter: (a, b) => a.score - b.score, render: scoreTag },
    { title: 'Fix', key: 'f', render: (_: unknown, q) => (filed.includes(q.key) ? <Tag color="success" bordered={false}>Filed</Tag> : <Button size="small" onClick={() => setPrep(q)}>Prepare correction</Button>) },
  ];

  return (
    <>
      <PageHead
        title="Content & Listing Health"
        sub={`${d.latest.length} listings checked on the latest capture · ${scopeLabel} · image and description checks are sample`}
        actions={<>
          <Button onClick={() => { downloadCsv('fix-queue.csv', shownQ.map((q) => ({ product: q.name || `id ${q.rows[0].product_id}`, pack: q.pack, platform: platformLabel(q.platform), cities: q.cities.join(' | '), failed_checks: q.checks.map((c) => CHECK[c].label).join(' | '), score: q.score }))); message.success('Fix queue exported'); }}>Export queue</Button>
          <Button type="primary" onClick={() => setRouteOpen(true)}>Route the queue</Button>
        </>}
      />
      <Gate d={d}>
        <Tiles items={[
          { label: 'Listings checked', value: d.latest.length, note: `${platforms.length} platform${platforms.length > 1 ? 's' : ''}` },
          { label: 'Defects', value: defects.length, note: `${CHECKS.filter((c) => c.real).length} real checks + 2 sample` },
          { label: 'Listings with a defect', value: defective, note: `${d.latest.length ? Math.round((defective / d.latest.length) * 100) : 0}% of rows` },
          { label: 'Fix queue', value: queue.length, note: 'SKU × platform items' },
          { label: 'Average score', value: avgScore, note: 'out of 100' },
        ]} />
        <div className="bento">
          <Section title="The fix queue" sub={`${shownQ.length} of ${queue.length} items`} />
          <Card className="span-12" title="What to fix first" sub="One row per SKU × platform — one edit clears every city the defect repeats in" lift={false}
            actions={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Select size="small" value={fPlat} onChange={setFPlat} aria-label="Platform" style={{ width: 150 }} options={[{ value: 'all', label: 'All platforms' }, ...platforms.map((p) => ({ value: p, label: platformLabel(p) }))]} />
              <Select size="small" value={fCheck} onChange={setFCheck} aria-label="Check" style={{ width: 200 }} options={[{ value: 'all', label: 'All checks' }, ...CHECKS.map((c) => ({ value: c.id, label: c.label }))]} />
              <Select size="small" value={fLine} onChange={setFLine} aria-label="Product line" style={{ width: 150 }} options={[{ value: 'all', label: 'All lines' }, ...lines.map((l) => ({ value: l, label: l }))]} />
              <Segmented size="small" value={heavy ? 'heavy' : 'all'} onChange={(v) => setHeavy(v === 'heavy')} options={[{ value: 'all', label: 'All' }, { value: 'heavy', label: 'Score < 70' }]} />
              <Button size="small" onClick={() => setBatchOpen(true)}>Create batches</Button>
            </div>}
            footer={<><Prov>Shelf capture · {scopeLabel}</Prov><Prov kind="sample">Image and description checks are sample</Prov></>}>
            <Table size="small" rowKey="key" columns={qCols} dataSource={shownQ} pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} locale={{ emptyText: 'Nothing in the queue for these filters' }} />
          </Card>

          <Section title="Defect types" sub={`${defects.length} defects across ${CHECKS.length} checks`} />
          <Card className="span-7" title="Every check, and the fix it needs" sub="A row opens the listings behind it" footer={<Prov>Computed on the capture</Prov>}>
            <Table size="small" rowKey="id" pagination={false} scroll={{ x: 'max-content' }} dataSource={byCheck}
              onRow={(c) => ({ onClick: () => c.listings && openRows(c.label, c.trips, c.rows), style: { cursor: c.listings ? 'pointer' : 'default' } })}
              columns={[
                { title: 'Check', dataIndex: 'label', render: (v: string, c) => <div><b>{v}</b> {!c.real && <Prov kind="sample">Sample</Prov>}</div> },
                { title: 'What trips it', dataIndex: 'trips', render: (v: string) => <span className="muted" style={{ fontSize: 12.5 }}>{v}</span> },
                { title: 'Fix action', dataIndex: 'fix' },
                { title: 'Listings', dataIndex: 'listings', align: 'right' },
                { title: 'SKUs', dataIndex: 'skus', align: 'right' },
                { title: 'Where', key: 'w', render: (_: unknown, c) => <Tag bordered={false}>{c.field}</Tag> },
              ]} />
          </Card>
          <Card className="span-5" title="Defects by type" sub="Listings failing each check" footer={<Prov>Computed on the capture</Prov>}>
            <BarChart data={byCheck.filter((c) => c.listings).map((c) => ({ check: c.label, listings: c.listings }))} x="check" y="listings" height={320} />
          </Card>

          <Section title="By platform" sub="Scores, defect mix and what each platform's listings carry" />
          <Card className="span-4" title="Score by platform" sub="Average listing score, out of 100" footer={<Prov>Computed on the capture</Prov>}>
            <ColumnChart data={platStats.map((p) => ({ platform: platformLabel(p.platform), score: p.score }))} x="platform" y="score" color="platform" yMin={0} yMax={100} height={240} />
          </Card>
          <Card className="span-8" title="Defects by platform" sub="Where the defect count actually sits · a row opens that platform's listings" footer={<Prov>Computed on the capture</Prov>}>
            <Table size="small" rowKey="platform" pagination={false} scroll={{ x: 'max-content' }} dataSource={platStats}
              onRow={(p) => ({ onClick: () => openRows(`${platformLabel(p.platform)} listings`, `${p.listings} listing rows`, p.rows), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
                { title: 'Listings', dataIndex: 'listings', align: 'right' },
                { title: 'Clean', dataIndex: 'clean', align: 'right' },
                { title: 'Defects', dataIndex: 'defects', align: 'right' },
                { title: 'Score', dataIndex: 'score', align: 'right', render: (v: number) => scoreTag(v) },
                { title: 'Defect mix', key: 'mix', render: (_: unknown, p) => <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{p.mix.map((m) => <Tag key={m.id} bordered={false}>{CHECK[m.id].label} · {m.n}</Tag>)}</div> },
              ]} />
          </Card>
          <Card className="span-12" title="What each platform's listings carry" sub="Share of listed rows that carry each field" footer={<><Prov>Fields from the capture</Prov><Prov kind="sample">Images and descriptions are sample</Prov></>}>
            <Table size="small" rowKey="platform" pagination={false} scroll={{ x: 'max-content' }} dataSource={platStats}
              columns={[
                { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
                ...(['Pack', 'Category', 'MRP', 'Shelf life', 'Marketer'] as const).map((k) => ({ title: k, key: k, align: 'right' as const, render: (_: unknown, p: (typeof platStats)[number]) => `${p.cov[k]}%` })),
                { title: 'Images ≥ 4 (sample)', key: 'img', align: 'right' as const, render: () => '91%' },
                { title: 'Description (sample)', key: 'desc', align: 'right' as const, render: () => '86%' },
              ]} />
          </Card>

          <Section title="By product line" sub="Defects per 100 listings ranks a line whatever its size" />
          <Card className="span-12" title="Product lines" sub="Defects per 100 listings ranks a line whatever its size · a row opens its listings" footer={<Prov>Computed on the capture</Prov>}>
            <Table size="small" rowKey="line" pagination={false} scroll={{ x: 'max-content' }} dataSource={lineStats}
              onRow={(l) => ({ onClick: () => openRows(`${l.line} listings`, `${l.listings} listing rows`, l.rows), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Product line', dataIndex: 'line', render: (v: string) => <b>{v}</b> },
                { title: 'Listings', dataIndex: 'listings', align: 'right' },
                { title: 'SKUs', dataIndex: 'skus', align: 'right' },
                { title: 'Defects', dataIndex: 'defects', align: 'right' },
                { title: 'Per 100 listings', dataIndex: 'per100', align: 'right' },
                { title: 'Score', dataIndex: 'score', align: 'right', render: (v: number) => scoreTag(v) },
              ]} />
          </Card>
        </div>
      </Gate>

      <RowsDrawer spec={rows} onClose={() => setRows(null)} />

      <Drawer open={!!prep} onClose={() => setPrep(null)} width={680} title={prep ? `Prepare correction · ${prep.name ? shortName(prep.name) : `id ${prep.rows[0].product_id}`}` : ''} destroyOnClose>
        {prep && <>
          <h3 style={{ marginTop: 0 }}>Every check on this listing</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{prep.checks.map((c) => <Tag key={c} color="error" bordered={false}>{CHECK[c].label}</Tag>)}</div>
          <Table size="small" rowKey={(_, i) => String(i)} pagination={false} dataSource={prep.defects.filter((x, i, a) => a.findIndex((y) => y.checkId === x.checkId && y.seen === x.seen) === i)} scroll={{ x: 'max-content' }} columns={[
            { title: 'Field', key: 'f', render: (_: unknown, x: Defect) => CHECK[x.checkId].field },
            { title: 'On the shelf now', dataIndex: 'seen' },
            { title: 'Proposed', dataIndex: 'proposed' },
          ]} />
          <h3>Where it goes</h3>
          <Select value={owner} onChange={setOwner} aria-label="Owner" style={{ width: '100%' }} options={OWNERS.map((o) => ({ value: o, label: o }))} />
          <h3>What would be created</h3>
          <p>One correction request for {platformLabel(prep.platform)} covering {prep.cities.join(' and ')} ({prep.rows.length} listing row{prep.rows.length > 1 ? 's' : ''}), assigned to {owner}.</p>
          <Button type="primary" onClick={() => { setFiled((f) => [...f, prep.key]); message.success(`Correction filed with ${owner}`); setPrep(null); }}>File the correction</Button>
        </>}
      </Drawer>

      <Modal open={routeOpen} title="Route the queue" okText="Route" onCancel={() => setRouteOpen(false)} onOk={() => { setRouteOpen(false); message.success(`${shownQ.length} queue items routed to ${owner}`); }}>
        <p className="muted">{shownQ.length} items in the current view.</p>
        <Select value={owner} onChange={setOwner} aria-label="Owner" style={{ width: '100%' }} options={OWNERS.map((o) => ({ value: o, label: o }))} />
      </Modal>
      <Modal open={batchOpen} title="Create batches" okText="Create batches" onCancel={() => setBatchOpen(false)} onOk={() => { setBatchOpen(false); message.success(`${batches.length} batches created`); }}>
        <p className="muted">One batch per platform × fix, so one person makes one kind of edit.</p>
        <Table size="small" rowKey={(b) => `${b.platform}${b.check}`} pagination={false} dataSource={batches} columns={[
          { title: 'Platform', dataIndex: 'platform', render: (v: string) => platformLabel(v) },
          { title: 'Fix', dataIndex: 'check', render: (v: string) => CHECK[v].fix },
          { title: 'Items', dataIndex: 'items', align: 'right' },
        ]} />
      </Modal>
    </>
  );
}
