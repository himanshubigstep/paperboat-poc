'use client';

import { useMemo, useState } from 'react';
import { Drawer, Progress, Table, Tag, message, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CityTag, Prov, SevTag, fmtNum } from '@/components/ui';
import { dashB } from '@/lib/api.dashboardB';
import { useFilters } from '@/hooks/useFilters';
import { useSignals } from '@/hooks/useSignals';
import { availabilityStats, round1 } from '@/lib/metrics';
import { platformLabel } from '@/lib/config';
import type { Severity, Signal } from '@/lib/types';
import { sampleRules } from '@/mock/dashboard-b';
import { Gate, computeInventory, pctOf } from './partsB';

interface Rule {
  id: string; name: string; module: string; scope: string; severity: Severity; owner: string; threshold: string; evaluates: string;
  matches: number; population: number; examples: { t: string; s: string; v: string }[]; byPlatform: Record<string, number>; byCity: Record<string, number>; source: 'real' | 'sample';
}
const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const count = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((a, x) => { const k = f(x); a[k] = (a[k] ?? 0) + 1; return a; }, {});
const SIG_RULES: { rule: string; name: string; module: string; severity: Severity; owner: string; evaluates: string }[] = [
  { rule: 'Out of stock for 2+ consecutive captures', name: 'A listing stays out of stock across consecutive captures', module: 'Availability', severity: 'high', owner: 'Supply planner', evaluates: 'Walks each listing’s captures newest to oldest and counts how many in a row show out of stock.' },
  { rule: 'Same pack, city price gap ≥ 5%', name: 'Same pack costs more in one city than another', module: 'Pricing', severity: 'high', owner: 'Revenue growth manager', evaluates: 'Compares the latest selling price of the same pack across cities on a platform.' },
  { rule: 'Discount depth change ≥ 4 pts in 3 days', name: 'Discount depth moved sharply', module: 'Pricing', severity: 'medium', owner: 'Revenue growth manager', evaluates: 'Discount is calculated from MRP and selling price, then compared with the capture three days earlier.' },
  { rule: 'Estimated sell-out swing ≥ 20% day on day', name: 'Estimated sell-out swings day on day', module: 'Sales', severity: 'medium', owner: 'Category manager', evaluates: 'Estimated units (stock decreases between captures, restocks excluded) over the last 24 h against the 24 h before.' },
  { rule: 'Stock up ≥ 8 units between captures', name: 'Listing restocked', module: 'Inventory', severity: 'low', owner: 'Supply planner', evaluates: 'Flags stock increases between consecutive captures; these are never counted as sales.' },
  { rule: 'Missing price/MRP on a listing', name: 'Listing returned no price or MRP', module: 'Data quality', severity: 'low', owner: 'Data steward', evaluates: 'Counts listings whose price, MRP, brand and category are empty (not listed for that pincode).' },
];

export default function AnomaliesTab() {
  const { platforms, cities, query } = useFilters();
  const d = useSignals();
  const search = useQuery({ queryKey: ['dashB', 'search', platforms, cities], queryFn: () => dashB.search(platforms, cities) });
  const ads = useQuery({ queryKey: ['dashB', 'ads', platforms], queryFn: () => dashB.ads(platforms) });
  const sla = useQuery({ queryKey: ['dashB', 'sla', platforms, cities], queryFn: () => dashB.sla(platforms, cities) });
  const [open, setOpen] = useState<Rule | null>(null);
  const [acked, setAcked] = useState<Record<string, boolean>>({});

  const rules = useMemo<Rule[]>(() => {
    const out: Rule[] = [];
    const listed = d.latest.filter((s) => s.availability !== 'not_listed').length;
    const sigText = (s: Signal) => ({ t: s.product ?? s.title, s: `${platformLabel(s.platform)} · ${s.city}`, v: `${s.metric} ${s.delta}` });
    SIG_RULES.forEach((r) => {
      const sg = d.signals.filter((s) => s.rule === r.rule);
      out.push({ id: r.rule, name: r.name, module: r.module, scope: 'Listing', severity: r.severity, owner: r.owner, threshold: r.rule, evaluates: r.evaluates, matches: sg.length, population: r.module === 'Pricing' || r.module === 'Availability' || r.module === 'Inventory' ? Math.max(listed, sg.length) : Math.max(d.latest.length, sg.length), examples: sg.slice(0, 3).map(sigText), byPlatform: count(sg, (s) => s.platform), byCity: count(sg, (s) => s.city), source: 'real' });
    });
    const oos = d.latest.filter((s) => s.availability === 'out_of_stock');
    out.push({ id: 'oos_now', name: 'A listing is out of stock at this capture', module: 'Availability', scope: 'Listing', severity: 'critical', owner: 'Supply planner', threshold: 'Availability = out of stock', evaluates: 'Reads the newest capture of every listed product and counts those that cannot be bought.', matches: oos.length, population: listed, examples: oos.slice(0, 3).map((s) => ({ t: `${s.name.replace(/^paper boat\s+/i, '')} · ${s.pack_size}`, s: `${platformLabel(s.platform)} · ${s.city}`, v: 'Out of stock' })), byPlatform: count(oos, (s) => s.platform), byCity: count(oos, (s) => s.city), source: 'real' });
    const inv = computeInventory(d.latest, d.intervals);
    const dead = inv.filter((r) => r.risk === 'Dead-stock risk');
    const low = inv.filter((r) => r.risk === 'Low cover');
    const mk = (id: string, name: string, sev: Severity, thr: string, ev: string, rs: typeof inv): Rule => ({ id, name, module: 'Inventory & expiry', scope: 'SKU × city', severity: sev, owner: 'Supply planner', threshold: thr, evaluates: ev, matches: rs.length, population: inv.length, examples: rs.slice(0, 3).map((r) => ({ t: `${r.name} · ${r.pack}`, s: r.city, v: r.cover === null ? 'no sales seen' : `${r.cover} d cover` })), byPlatform: count(rs, (r) => r.platform), byCity: count(rs, (r) => r.city), source: 'real' });
    out.push(mk('dead_stock', 'Days of cover exceed a quarter of shelf life', 'high', 'Cover ≥ 25% of shelf life', 'Days of cover (stock ÷ estimated units per day) against the pack’s shelf life from the listing.', dead));
    out.push(mk('low_cover', 'Cover below two days', 'high', 'Cover < 2 d', 'Stock divided by estimated daily sell-out.', low));
    const realBuyable: Record<string, number> = {};
    platforms.forEach((p) => { realBuyable[p] = availabilityStats(d.latest.filter((s) => s.platform === p)).buyablePct; });
    if (search.data && ads.data && sla.data) sampleRules(platforms, cities, search.data, ads.data, sla.data, realBuyable).forEach((r) => out.push({ ...r, byPlatform: r.byPlatform, byCity: r.byCity, threshold: r.threshold, source: 'sample' }));
    return out.filter((r) => r.matches > 0).sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.matches - a.matches);
  }, [d.signals, d.latest, d.intervals, search.data, ads.data, sla.data, platforms, cities]);

  const sum = useMemo(() => {
    const mods: Record<string, number> = {};
    rules.forEach((r) => (mods[r.module] = (mods[r.module] ?? 0) + r.matches));
    const worst = Object.entries(mods).sort((a, b) => b[1] - a[1])[0];
    return { total: rules.reduce((a, r) => a + r.matches, 0), critical: rules.filter((r) => r.severity === 'critical').length, high: rules.filter((r) => r.severity === 'high').length, medium: rules.filter((r) => r.severity === 'medium').length, worst, mods: Object.keys(mods).length };
  }, [rules]);

  const cols: ColumnsType<Rule> = [
    { title: 'Severity', dataIndex: 'severity', width: 100, render: (s: Severity) => <SevTag v={s} />, sorter: (a, b) => ORDER[a.severity] - ORDER[b.severity] },
    { title: 'What breached', dataIndex: 'name', render: (n: string, r) => <><b>{n}</b>{r.source === 'sample' && <Tag bordered={false} color="orange" style={{ marginLeft: 8 }}>sample</Tag>}</> },
    { title: 'Module', dataIndex: 'module' },
    { title: 'Breaches', dataIndex: 'matches', align: 'right', sorter: (a, b) => a.matches - b.matches, render: (m: number, r) => <><b>{fmtNum(m)}</b> <span className="muted">/ {fmtNum(r.population)}</span></> },
    { title: 'Share breaching', key: 'share', width: 170, render: (_: unknown, r) => <Progress percent={Math.min(100, pctOf(r.matches, r.population))} size="small" format={(p) => `${round1(p ?? 0)}%`} strokeColor={r.severity === 'critical' ? 'var(--pb-coral)' : r.severity === 'high' ? 'var(--pb-sunset)' : 'var(--pb-violet)'} /> },
    { title: 'Threshold', dataIndex: 'threshold', render: (t: string) => <span className="muted">{t}</span> },
    { title: 'Owner', dataIndex: 'owner', render: (o: string) => <Tag bordered={false}>{o}</Tag> },
  ];
  const breakdown = (title: string, rec: Record<string, number>, city = false) => Object.keys(rec).length ? (
    <div style={{ marginTop: 16 }}><h4 style={{ margin: '0 0 6px' }}>{title}</h4>{Object.entries(rec).sort((a, b) => b[1] - a[1]).map(([k, v]) => (city ? <span key={k} style={{ marginRight: 8 }}><CityTag city={k} /> {v}</span> : <Tag key={k} bordered={false}>{platformLabel(k)} · {v}</Tag>))}</div>
  ) : null;

  const loading = d.isLoading || search.isLoading || ads.isLoading || sla.isLoading;
  return (
    <Gate loading={loading} error={d.isError || search.isError} onRetry={() => { d.refetch(); search.refetch(); }}>
      <div className="bento">
        <Card className="span-12" title="Rules breaching at this capture" sub="Every standing rule evaluated against the latest capture · click a row for the evidence behind it"
          actions={<Link href={`/signals${query}`}><Button size="small">Open in Signals</Button></Link>}
          footer={<><Prov>Computed from the capture</Prov><Prov kind="sample">Search, media and delivery rules use sample data</Prov></>}>
          <div className="bento" style={{ marginBottom: 16 }}>
            {[['Rules breaching', `${rules.length}`, 'evaluated on this capture'], ['Critical', `${sum.critical}`, `${sum.high} high · ${sum.medium} medium`], ['Breaches counted', fmtNum(sum.total), `across ${sum.mods} modules`], ['Heaviest module', sum.worst?.[0] ?? '—', `${sum.worst?.[1] ?? 0} breaches`]].map(([t, n, s]) => (
              <div key={t} className="span-3"><div className="muted" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{n}</div><div className="muted" style={{ fontSize: 12 }}>{s}</div></div>
            ))}
          </div>
          <Table<Rule> size="small" rowKey="id" pagination={false} columns={cols} dataSource={rules} scroll={{ x: 'max-content' }} locale={{ emptyText: 'No rule is breaching at this capture.' }}
            onRow={(r) => ({ onClick: () => setOpen(r), tabIndex: 0, style: { cursor: 'pointer' }, onKeyDown: (e) => e.key === 'Enter' && setOpen(r) })} />
        </Card>
      </div>
      <Drawer open={!!open} onClose={() => setOpen(null)} width={560} title={open?.name}
        extra={open && <SevTag v={open.severity} />}
        footer={open && <Button type="primary" disabled={acked[open.id]} onClick={() => { setAcked((a) => ({ ...a, [open.id]: true })); message.success('Acknowledged — owner notified'); }}>{acked[open.id] ? 'Acknowledged' : 'Acknowledge'}</Button>}>
        {open && (
          <>
            <p className="muted">{open.module} · {fmtNum(open.matches)} of {fmtNum(open.population)} {open.scope.toLowerCase()} breached{open.source === 'sample' ? ' · sample data' : ''}</p>
            <h4>What the rule reads</h4><p>{open.evaluates}</p>
            <h4>Threshold</h4><p><Tag bordered={false}>{open.threshold}</Tag><Tag bordered={false}>{open.owner}</Tag></p>
            {open.examples.length > 0 && (<><h4>From this capture — {open.examples.length} of {fmtNum(open.matches)} breaches</h4>
              <Table size="small" pagination={false} showHeader={false} rowKey={(e) => `${e.t}|${e.s}`} dataSource={open.examples} columns={[{ dataIndex: 't', render: (v: string) => <b>{v}</b> }, { dataIndex: 's' }, { dataIndex: 'v', render: (v: string) => <span className="muted">{v}</span> }]} /></>)}
            {breakdown('By platform', open.byPlatform)}
            {breakdown('By city', open.byCity, true)}
          </>
        )}
      </Drawer>
    </Gate>
  );
}
