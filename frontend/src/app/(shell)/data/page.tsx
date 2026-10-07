'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Modal, Progress, Select, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Card, PageHead, Prov, Section, UrlTabs, fmtIST, fmtNum, shortName, PlatformTag } from '@/components/ui';
import { DonutChart } from '@/components/charts';
import { Gate, Tiles } from '@/components/pagekit/Gate';
import { RowsDrawer, snapshotColumns, type DrawerSpec } from '@/components/pagekit/RowsDrawer';
import { buildMaster, isUntitled, type SkuGroup } from '@/components/pagekit/catalogue';
import { downloadCsv } from '@/components/pagekit/csv';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { availabilityStats } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';
import { GENERAL_FEEDS, LINEAGE, platformFeeds, type Feed } from '@/mock/data-feeds';
import { runQuality, type QCheck } from './quality';


const statusTag = (s: Feed['status']) => <Tag bordered={false} color={s === 'connected' ? 'success' : s === 'pending access' ? 'warning' : 'default'}>{s === 'connected' ? 'Connected' : s === 'pending access' ? 'Pending access' : 'Not connected'}</Tag>;
const qTag = (s: QCheck['status']) => <Tag bordered={false} color={s === 'pass' ? 'success' : s === 'warn' ? 'warning' : 'error'}>{s === 'pass' ? 'Pass' : s === 'warn' ? 'Warn' : 'Fail'}</Tag>;

export default function Page() {
  const d = useDataset();
  const { platforms, scopeLabel } = useFilters();
  const [rows, setRows] = useState<DrawerSpec<Snapshot> | null>(null);
  const [skuRows, setSkuRows] = useState<DrawerSpec<Snapshot> | null>(null);
  const [recapture, setRecapture] = useState(false);
  const [request, setRequest] = useState<{ open: boolean; feed?: string; note: string }>({ open: false, note: '' });
  const [focus, setFocus] = useState<string | undefined>();
  const [skuQ, setSkuQ] = useState('');

  const captured = d.meta?.captured_at ?? '';
  const { skus, unmatched } = useMemo(() => buildMaster(d.latest), [d.latest]);
  const quality = useMemo(() => runQuality(d.snapshots, d.latest, d.meta?.captures_per_day ?? 3), [d.snapshots, d.latest, d.meta]);
  const stores = useMemo(() => new Set(d.latest.map((r) => `${r.platform}|${r.store_id ?? r.pincode}`)).size, [d.latest]);

  const feeds: Feed[] = useMemo(() => {
    const pf = platformFeeds();
    return [...pf, ...GENERAL_FEEDS];
  }, []);
  const rowsFor = (f: Feed) => (f.platform ? d.all.filter((s) => s.platform === f.platform).length : f.id === 'store_directory' ? stores : f.id === 'sku_master' ? skus.length : 0);
  const connected = feeds.filter((f) => f.status === 'connected' && (!f.platform || platforms.includes(f.platform)));
  const missing = feeds.filter((f) => f.status !== 'connected');
  const unconnectedPlatforms = missing.filter((f) => f.platform);
  const readRows = connected.filter((f) => f.platform).reduce((a, f) => a + rowsFor(f), 0);
  const matched = d.latest.length - unmatched.length;

  const openRaw = (title: string, sub: string, data: Snapshot[]) => setRows({ title, sub, columns: snapshotColumns, rows: data, rowKey: (r) => `${r.platform}${r.city}${r.product_id}${r.scraped_at}` });

  const feedCols: ColumnsType<Feed> = [
    { title: 'Feed', dataIndex: 'name', render: (n: string) => <b>{n}</b> },
    { title: 'Category', dataIndex: 'category', render: (v: string) => <Tag bordered={false}>{v}</Tag> },
    { title: 'Route', dataIndex: 'route', render: (v: string) => <span className="muted">{v}</span> },
    { title: 'Grain', dataIndex: 'grain', render: (v: string) => <span className="muted">{v}</span> },
    { title: 'Rows', key: 'rows', align: 'right', render: (_: unknown, f) => <span className="tnum">{fmtNum(rowsFor(f))}</span> },
    { title: 'Dated', key: 'dated', render: (_: unknown, f) => <span className="muted">{captured ? fmtIST(captured) : '—'} <Tag bordered={false} color={f.stamp === 'row' ? 'success' : 'default'}>{f.stamp === 'row' ? 'Row stamp' : 'File date'}</Tag></span> },
    { title: 'Owner', dataIndex: 'owner', render: (v: string) => <span className="muted">{v}</span> },
    { title: 'Status', dataIndex: 'status', render: statusTag },
    { title: '', key: 'a', render: (_: unknown, f) => (f.platform ? <Button size="small" onClick={() => openRaw(`${f.name} · raw capture rows`, `${fmtNum(rowsFor(f))} rows in scope · newest first`, [...d.snapshots.filter((s) => s.platform === f.platform)].reverse())}>View rows</Button> : <Button size="small" onClick={() => openRaw(f.name, f.id === 'sku_master' ? 'The listing rows behind the canonical SKU master' : 'The listing rows the store directory is read from', d.latest)}>View rows</Button>) },
  ];

  const missCols: ColumnsType<Feed> = [
    { title: 'Feed', dataIndex: 'name', render: (n: string, f) => <div><b>{n}</b><div className="muted" style={{ fontSize: 12 }}>{f.grain}</div></div> },
    { title: 'Route', dataIndex: 'route', render: (v: string) => <span className="muted">{v}</span> },
    { title: 'Owner', dataIndex: 'owner', render: (v: string) => <span className="muted">{v}</span> },
    { title: 'Status', dataIndex: 'status', render: statusTag },
    { title: 'Screens standing in for it', dataIndex: 'screens', render: (v: string[]) => <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{v.length ? v.map((x) => <Tag key={x} bordered={false}>{x}</Tag>) : <span className="muted">none</span>}</div> },
    { title: '', key: 'a', render: (_: unknown, f) => <Button size="small" onClick={() => setRequest({ open: true, feed: f.id, note: '' })}>Request access</Button> },
  ];

  const qCols: ColumnsType<QCheck> = [
    { title: 'Check', dataIndex: 'check', render: (v: string) => <b>{v}</b> },
    { title: 'Dataset', dataIndex: 'dataset', render: (v: string) => <code>{v}</code> },
    { title: 'Rule', dataIndex: 'rule', render: (v: string) => <span className="muted">{v}</span> },
    { title: 'Checked', dataIndex: 'checked', align: 'right', render: (v: number) => <span className="tnum">{fmtNum(v)}</span> },
    { title: 'Failed', dataIndex: 'failed', align: 'right', render: (v: number) => <span className="tnum">{fmtNum(v)}</span> },
    { title: 'Result', dataIndex: 'status', render: qTag },
    { title: '', key: 'a', render: (_: unknown, c) => <Button size="small" disabled={!c.failed} onClick={() => openRaw(`${c.check} · failing rows`, c.rule, c.rows)}>View rows</Button> },
  ];

  const qMix = (['pass', 'warn', 'fail'] as const).map((s) => ({ outcome: s === 'pass' ? 'Pass' : s === 'warn' ? 'Warn' : 'Fail', n: quality.filter((c) => c.status === s).length })).filter((x) => x.n);
  const nodeById = Object.fromEntries(LINEAGE.nodes.map((n) => [n.id, n]));
  const related = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    const up = (id: string) => nodeById[id].from.forEach((p) => { set.add(p); up(p); });
    up(focus);
    const down = (id: string) => LINEAGE.nodes.filter((n) => n.from.includes(id)).forEach((n) => { set.add(n.id); down(n.id); });
    down(focus);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const datasets = [
    { name: 'listing_snapshot', layer: 'Operational', rows: d.all.length, grain: 'listing × store × capture', source: 'Shelf capture', feeds: 'Availability, Price, Sell-out estimate', state: 'Live', owner: 'Data platform' },
    { name: 'product_offer', layer: 'Operational', rows: d.latest.length, grain: 'newest capture of each listing', source: 'Shelf capture', feeds: 'Dashboards, Catalogue, Content health', state: 'Live', owner: 'Data platform' },
    { name: 'store_directory', layer: 'Operational', rows: stores, grain: 'store', source: 'Shelf capture', feeds: 'Network', state: 'Live', owner: 'Data platform' },
    { name: 'canonical_sku', layer: 'Operational', rows: skus.length, grain: 'canonical SKU', source: 'Shelf capture + matching', feeds: 'Catalogue Matching, Assistant', state: 'Live', owner: 'Catalogue team' },
    { name: 'sellout_interval (estimate)', layer: 'Analytics', rows: d.intervals.length, grain: 'listing × capture gap', source: 'listing_snapshot', feeds: 'Sales, Reports, Assistant', state: 'Live', owner: 'Insights' },
    { name: 'content_health_check', layer: 'Analytics', rows: d.latest.length, grain: 'listing', source: 'product_offer', feeds: 'Content & Listing Health', state: 'Live', owner: 'Catalogue team' },
    { name: 'sellout_daily', layer: 'Operational', rows: 0, grain: 'SKU × city × day', source: 'Platform sell-out', feeds: 'Sales, Value', state: 'Not connected', owner: 'Sales ops' },
    { name: 'ad_performance', layer: 'Operational', rows: 0, grain: 'campaign × day', source: 'Retail media', feeds: 'Media efficiency', state: 'Not connected', owner: 'Performance marketing' },
    { name: 'inventory_position', layer: 'Operational', rows: 0, grain: 'batch × warehouse', source: 'ERP inventory', feeds: 'Inventory', state: 'Not connected', owner: 'Supply chain' },
    { name: 'review_text', layer: 'Staging', rows: 0, grain: 'review', source: 'Customer voice', feeds: 'Customer voice', state: 'Not connected', owner: 'Consumer insights' },
  ];
  const [layer, setLayer] = useState<string>('All');
  const dsShown = datasets.filter((x) => layer === 'All' || x.layer === layer);

  const skuCols: ColumnsType<SkuGroup> = [
    { title: 'SKU', dataIndex: 'sku', render: (v: string) => <code>{v}</code> },
    { title: 'Name', dataIndex: 'name', render: (v: string) => shortName(v) },
    { title: 'Pack', dataIndex: 'pack' },
    { title: 'Line', dataIndex: 'line', render: (v: string) => <Tag bordered={false}>{v}</Tag> },
    { title: 'Category', dataIndex: 'category' },
    { title: 'Platform ids', key: 'ids', render: (_: unknown, s) => <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{s.ids.map((i) => <Tag key={`${i.platform}${i.city}${i.product_id}`} bordered={false}>{platformLabel(i.platform)} · {i.city} · {i.product_id}</Tag>)}</div> },
    { title: '', key: 'a', render: (_: unknown, s) => <Button size="small" onClick={() => setSkuRows({ title: `${s.sku} · ${shortName(s.name)}`, sub: `${s.rows.length} listing rows`, columns: snapshotColumns, rows: s.rows, rowKey: (r) => `${r.city}${r.product_id}` })}>View rows</Button> },
  ];
  const skuShown = skus.filter((s) => !skuQ || `${s.sku} ${s.name} ${s.pack} ${s.line} ${s.ids.map((i) => i.product_id).join(' ')}`.toLowerCase().includes(skuQ.toLowerCase()));

  const covByPlatform = platforms.map((p) => {
    const rs = d.latest.filter((r) => r.platform === p);
    const um = rs.filter((r) => isUntitled(r)).length;
    return { platform: p, listings: rs.length, matched: rs.length - um, unmatched: um };
  }).filter((x) => x.listings);
  const withMultiNames = skus.filter((s) => s.names.length > 1).length;

  return (
    <>
      <PageHead
        title="Data & Datasets"
        sub="Feed status, datasets, quality checks, lineage and the canonical SKU master"
        actions={<>
          <Button onClick={() => setRecapture(true)}>Re-run capture</Button>
          <Button onClick={() => { downloadCsv('quality-checks.csv', quality.map((c) => ({ check: c.check, dataset: c.dataset, rule: c.rule, checked: c.checked, failed: c.failed, result: c.status }))); message.success('Quality checks exported'); }}>Export</Button>
          <Button type="primary" onClick={() => setRequest({ open: true, note: '' })}>Request a feed</Button>
        </>}
      />
      <Gate d={d}>
        <Tiles items={[
          { label: 'Feeds connected', value: connected.length, note: `of ${feeds.length} in the catalogue` },
          { label: 'Rows read', value: fmtNum(readRows), note: `${connected.filter((f) => f.platform).length} shelf capture feed(s)` },
          { label: 'Not connected', value: missing.length, note: `${unconnectedPlatforms.length} platforms` },
          { label: 'Last capture', value: captured ? fmtIST(captured).split(' IST')[0] : '—', note: `${d.captures.length} captures in scope` },
          { label: 'Match coverage', value: `${Math.round((matched / Math.max(1, d.latest.length)) * 1000) / 10}%`, note: `${matched} of ${d.latest.length} listings` },
          { label: 'Quality checks', value: `${quality.filter((c) => c.status === 'pass').length}/${quality.length}`, note: 'passing' },
        ]} />
        <UrlTabs defaultKey="feeds" items={[
          { key: 'feeds', label: 'Feeds', children: (
            <div className="bento">
              <Card className="span-12" title="Connected feeds" sub={`${connected.length} feeds · ${fmtNum(readRows)} rows read · ${scopeLabel}`} actions={<Prov>Shelf capture · {captured ? fmtIST(captured) : ''}</Prov>}>
                <Table size="small" rowKey="id" columns={feedCols} dataSource={connected} pagination={false} scroll={{ x: 'max-content' }} />
              </Card>
              <Card className="span-12" title="What is not connected" sub={`${missing.length} feeds carry no rows — ${unconnectedPlatforms.length} platforms plus ${missing.length - unconnectedPlatforms.length} data feeds`} actions={<Prov kind="sample">Sample catalogue</Prov>}>
                <Table size="small" rowKey="id" columns={missCols} dataSource={missing} pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
              </Card>
            </div>
          ) },
          { key: 'datasets', label: 'Datasets', children: (
            <Card title="Datasets" sub="Every dataset the build writes, with row counts from the capture in scope" actions={<Select size="small" value={layer} onChange={setLayer} aria-label="Layer" style={{ width: 150 }} options={['All', 'Staging', 'Operational', 'Analytics'].map((v) => ({ value: v, label: v === 'All' ? 'All layers' : v }))} />} footer={<><Prov>Row counts · shelf capture</Prov><Prov kind="sample">Unconnected datasets are placeholders</Prov></>}>
              <Table size="small" rowKey="name" pagination={false} scroll={{ x: 'max-content' }} dataSource={dsShown} columns={[
                { title: 'Dataset', dataIndex: 'name', render: (v: string) => <code>{v}</code> },
                { title: 'Layer', dataIndex: 'layer', render: (v: string) => <Tag bordered={false}>{v}</Tag> },
                { title: 'Rows', dataIndex: 'rows', align: 'right', render: (v: number, r: { state: string }) => (r.state === 'Live' ? <span className="tnum">{fmtNum(v)}</span> : <span className="muted">—</span>) },
                { title: 'Grain', dataIndex: 'grain' },
                { title: 'Source', dataIndex: 'source' },
                { title: 'Feeds screens', dataIndex: 'feeds' },
                { title: 'Owner', dataIndex: 'owner' },
                { title: 'State', dataIndex: 'state', render: (v: string) => <Tag bordered={false} color={v === 'Live' ? 'success' : 'default'}>{v}</Tag> },
              ]} />
            </Card>
          ) },
          { key: 'quality', label: `Quality (${quality.filter((c) => c.status !== 'pass').length})`, children: (
            <div className="bento">
              <Card className="span-4" title="Check outcomes" sub={`${quality.length} checks run on the capture`} footer={<Prov>Computed on {fmtNum(d.snapshots.length)} snapshots</Prov>}>
                <DonutChart data={qMix} angle="n" color="outcome" height={240} />
              </Card>
              <Card className="span-8" title="Checks" sub="Rules evaluated on the real snapshots in the current filter scope" footer={<Prov>Shelf capture · {scopeLabel}</Prov>}>
                <Table size="small" rowKey="id" columns={qCols} dataSource={quality} pagination={false} scroll={{ x: 'max-content' }} />
              </Card>
            </div>
          ) },
          { key: 'lineage', label: 'Lineage', children: (
            <Card title="Lineage" sub="Source → staging → operational → analytics → consumers" actions={<Select allowClear size="small" placeholder="Focus a dataset" aria-label="Focus a node" style={{ width: 220 }} value={focus} onChange={setFocus} options={LINEAGE.nodes.map((n) => ({ value: n.id, label: n.label }))} />} footer={<Prov kind="sample">Lineage map is documentation, not a live trace</Prov>}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 14, overflowX: 'auto' }}>
                {LINEAGE.columns.map((c, ci) => (
                  <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{c} {ci < 4 && '→'}</div>
                    {LINEAGE.nodes.filter((n) => n.col === ci).map((n) => (
                      <button key={n.id} type="button" onClick={() => setFocus(focus === n.id ? undefined : n.id)} aria-pressed={focus === n.id} style={{ textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 12, border: `1px solid ${focus === n.id ? 'var(--pb-violet)' : 'var(--border)'}`, background: 'var(--raised)', color: 'var(--ink)', opacity: related && !related.has(n.id) ? 0.3 : 1, fontWeight: 600, fontSize: 13 }}>
                        {n.label}
                        {n.from.length > 0 && <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>from {n.from.map((f) => nodeById[f].label).join(', ')}</div>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          ) },
          { key: 'sku', label: 'SKU master', children: (
            <div className="bento">
              <Card className="span-7" title="Match coverage" sub="Paper Boat listings tied to a canonical SKU" footer={<Prov>Shelf capture · latest</Prov>}>
                <Table size="small" rowKey="platform" pagination={false} dataSource={covByPlatform} columns={[
                  { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
                  { title: 'Listings', dataIndex: 'listings', align: 'right' },
                  { title: 'Matched', dataIndex: 'matched', align: 'right' },
                  { title: 'Unmatched', dataIndex: 'unmatched', align: 'right' },
                  { title: 'Coverage', key: 'c', render: (_: unknown, r: { listings: number; matched: number }) => <Progress percent={Math.round((r.matched / r.listings) * 1000) / 10} size="small" /> },
                ]} />
                {unmatched.length > 0 && <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>{unmatched.length} listing ids carry no title yet — see Catalogue Matching for the review queue.</div>}
              </Card>
              <Card className="span-5" title="Linking method" sub="How a listing gets its canonical SKU" actions={<a href="/catalogue" aria-label="Open Catalogue Matching"><Button size="small">Open Catalogue Matching</Button></a>} footer={<Prov>Derived from the capture</Prov>}>
                <Table size="small" rowKey="m" pagination={false} dataSource={[
                  { m: 'Exact title + pack', n: skus.length - withMultiNames },
                  { m: 'Normalised title + pack (spacing, “+”/“⁺”)', n: withMultiNames },
                  { m: 'No title — unmatched', n: unmatched.length },
                ]} columns={[{ title: 'Method', dataIndex: 'm' }, { title: 'SKUs / ids', dataIndex: 'n', align: 'right' }]} />
              </Card>
              <Card className="span-12" title="Canonical SKU master" sub={`${skus.length} canonical SKUs · one identity per product with every platform id it was seen under`} actions={<div style={{ display: 'flex', gap: 8 }}><Input allowClear size="small" placeholder="Search SKUs" aria-label="Search SKUs" value={skuQ} onChange={(e) => setSkuQ(e.target.value)} style={{ width: 200 }} /><Button size="small" onClick={() => { downloadCsv('sku-master.csv', skus.map((s) => ({ sku: s.sku, name: s.name, pack: s.pack, line: s.line, category: s.category, platform_ids: s.ids.map((i) => `${i.platform}:${i.city}:${i.product_id}`).join(' | ') }))); message.success('SKU master exported'); }}>Export</Button></div>} footer={<><Prov>Shelf capture · {availabilityStats(d.latest).total} listings</Prov></>}>
                <Table size="small" rowKey="sku" columns={skuCols} dataSource={skuShown} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
              </Card>
            </div>
          ) },
        ]} />
      </Gate>

      <RowsDrawer spec={rows} onClose={() => setRows(null)} />
      <RowsDrawer spec={skuRows} onClose={() => setSkuRows(null)} />

      <Modal open={recapture} title="Re-run the capture" onCancel={() => setRecapture(false)} okText="Queue the capture" onOk={() => { setRecapture(false); message.success(`Capture queued for ${connected.filter((f) => f.platform).length} shelf feed(s)`); }}>
        <p className="muted">What would run</p>
        <ul>{connected.filter((f) => f.platform).map((f) => <li key={f.id}>{f.name} — {f.route}, {fmtNum(rowsFor(f))} rows on record</li>)}</ul>
        <p className="muted" style={{ fontSize: 12 }}>Captures run three times a day; a manual run adds an extra capture slot.</p>
      </Modal>
      <Modal open={request.open} title="Request a feed" onCancel={() => setRequest({ open: false, note: '' })} okText="Send the request" okButtonProps={{ disabled: !request.feed }} onOk={() => { const f = feeds.find((x) => x.id === request.feed); setRequest({ open: false, note: '' }); message.success(`Request for ${f?.name} routed to ${f?.owner}`); }}>
        <Select showSearch style={{ width: '100%', marginBottom: 12 }} placeholder="Pick a feed" aria-label="Feed" value={request.feed} onChange={(v) => setRequest((r) => ({ ...r, feed: v }))} options={missing.map((f) => ({ value: f.id, label: f.name }))} optionFilterProp="label" />
        {request.feed && <>
          <b>What switching it on needs</b>
          <ul>{(feeds.find((f) => f.id === request.feed)?.needs ?? []).map((n) => <li key={n}>{n}</li>)}</ul>
          <div className="muted" style={{ fontSize: 12.5 }}>Route to: {feeds.find((f) => f.id === request.feed)?.owner}</div>
        </>}
        <Input.TextArea rows={2} style={{ marginTop: 12 }} placeholder="Note for the owner (optional)" aria-label="Note" value={request.note} onChange={(e) => setRequest((r) => ({ ...r, note: e.target.value }))} />
      </Modal>
    </>
  );
}
