'use client';

import { Button, Progress, Select, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BankOutlined, CheckCircleOutlined, FileDoneOutlined, FieldTimeOutlined, LineChartOutlined, TeamOutlined } from '@ant-design/icons';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BarChart, ColumnChart } from '@/components/charts';
import { EvidenceModal } from '@/components/ops/EvidenceModal';
import { Tiles } from '@/components/ops/Tiles';
import { Card, CityTag, EmptyState, ErrorState, PageHead, PlatformTag, Prov, SkeletonBlock, UrlTabs, fmtINR } from '@/components/ui';
import { useFilters } from '@/hooks/useFilters';
import { useSignals } from '@/hooks/useSignals';
import { platformLabel } from '@/lib/config';
import { applyNext, buildCases, daysToVerify, FLOW, isOverdue, KINDS, kindLabel, rejectCase, STATE_LABEL, type OpsCase } from '@/mock/ops-cases';
import { anchorsOf, fmtDate, inrShort } from '@/mock/ops-common';
import { ValueDrawer } from './parts/ValueDrawer';

const open = (c: OpsCase) => c.step >= 0 && c.step < 5;

function Pips({ c }: { c: OpsCase }) {
  return (
    <span title={`${STATE_LABEL(c.step)} — step ${Math.max(c.step, 0) + 1} of ${FLOW.length}`} style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {FLOW.map((f, i) => (
        <i key={f.key} style={{ width: 9, height: 9, borderRadius: 9, background: c.step < 0 ? 'var(--pb-coral)' : i < c.step ? 'var(--pb-mint)' : i === c.step ? 'var(--pb-violet)' : 'var(--border)', opacity: c.step < 0 ? 0.45 : 1 }} />
      ))}
      <span style={{ marginInlineStart: 6, fontSize: 12.5 }}>{STATE_LABEL(c.step)}</span>
    </span>
  );
}

export default function Page() {
  const { platforms, cities, query } = useFilters();
  const d = useSignals();
  const sp = useSearchParams();
  const [edits, setEdits] = useState<Record<string, OpsCase>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [evId, setEvId] = useState<string | null>(null);
  const [fState, setFState] = useState('all');
  const [fKind, setFKind] = useState('all');
  const [fPlat, setFPlat] = useState('all');
  const [overdue, setOverdue] = useState(false);

  const capturedAt = d.meta?.captured_at ?? '';
  const today = capturedAt.slice(0, 10);
  const base = useMemo(() => buildCases({ signals: d.signals, latest: d.latest, anchors: anchorsOf(d.latest), platforms, cities, capturedAt }), [d.signals, d.latest, platforms, cities, capturedAt]);
  const cases = useMemo(() => base.map((c) => edits[c.id] ?? c), [base, edits]);
  const wanted = sp.get('case');
  useEffect(() => { if (wanted) setOpenId(wanted); }, [wanted]);

  if (d.isLoading) return (<><PageHead title="Value & Outcomes" /><SkeletonBlock h={420} /></>);
  if (d.isError) return (<><PageHead title="Value & Outcomes" /><ErrorState onRetry={() => d.refetch()} /></>);

  const put = (c: OpsCase) => setEdits((m) => ({ ...m, [c.id]: c }));
  const byId = (id: string | null) => cases.find((c) => c.id === id) ?? null;
  const measured = cases.filter((c) => c.step >= 5);
  const openCases = cases.filter(open);
  const verifiedInr = measured.reduce((a, c) => a + c.outcome.verifiedInr, 0);
  const claimedOpen = openCases.reduce((a, c) => a + c.outcome.claimedInr, 0);
  const claimedMeasured = measured.reduce((a, c) => a + c.outcome.claimedInr, 0);
  const cost = measured.reduce((a, c) => a + c.outcome.costInr, 0);
  const reach = (i: number) => (i === 0 ? cases.length : cases.filter((c) => c.step >= i).length);
  const ttv = cases.map(daysToVerify).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const med = ttv.length ? ttv[Math.floor(ttv.length / 2)] : null;
  const approvedN = cases.filter((c) => c.step >= 1).length;
  const executed = reach(2);
  const approvalRate = cases.length ? Math.round((approvedN / cases.length) * 1000) / 10 : 0;
  const verifRate = executed ? Math.round((reach(4) / executed) * 1000) / 10 : 0;
  const platList = Array.from(new Set(cases.map((c) => c.platform)));

  const filtered = cases.filter((c) => (fState === 'all' || (c.step < 0 ? 'rejected' : FLOW[c.step].key) === fState) && (fKind === 'all' || c.kind === fKind) && (fPlat === 'all' || c.platform === fPlat) && (!overdue || isOverdue(c, today)));

  const exportLedger = () => {
    const rows = [['Case', 'Kind', 'Platform', 'City', 'State', 'Owner', 'Priority', 'Due', 'Claimed INR', 'Verified INR'], ...cases.map((c) => [c.id, kindLabel(c.kind), platformLabel(c.platform), c.city, STATE_LABEL(c.step), c.owner, c.priority, c.dueAt, String(c.outcome.claimedInr), String(c.step >= 5 ? c.outcome.verifiedInr : 0)])];
    const blob = new Blob([rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'value-ledger.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    message.success(`Exported ${cases.length} cases`);
  };

  const cols: ColumnsType<OpsCase> = [
    { title: 'Case', key: 'c', width: 110, render: (_, c) => <b>{c.id}</b> },
    { title: 'Kind', key: 'k', width: 180, render: (_, c) => kindLabel(c.kind) },
    { title: 'What was observed', key: 'o', width: 300, render: (_, c) => <span title={c.observed}>{c.title}</span> },
    { title: 'Where', key: 'w', render: (_, c) => <span><PlatformTag id={c.platform} /> <CityTag city={c.city.split(' + ')[0]} /></span> },
    { title: 'State', key: 's', width: 230, render: (_, c) => <Pips c={c} /> },
    { title: 'Evidence', key: 'e', render: (_, c) => <span>{c.evidenceCount} <Tag color={c.real ? 'green' : 'gold'} bordered={false}>{c.real ? 'Real' : 'Sample'}</Tag></span> },
    { title: 'Owner', dataIndex: 'owner', ellipsis: true, width: 190 },
    { title: 'Pri', dataIndex: 'priority', width: 60, render: (v: string) => <Tag color={v === 'P1' ? 'red' : v === 'P2' ? 'orange' : 'default'} bordered={false}>{v}</Tag> },
    { title: 'Due', key: 'd', render: (_, c) => <span style={{ color: isOverdue(c, today) ? 'var(--pb-coral)' : undefined }}>{fmtDate(c.dueAt)}{isOverdue(c, today) ? ' · overdue' : ''}</span> },
    { title: 'Claimed', key: 'cl', align: 'right', render: (_, c) => (c.step < 0 ? <span className="muted">lapsed</span> : fmtINR(c.outcome.claimedInr)) },
    { title: 'Verified', key: 'v', align: 'right', render: (_, c) => (c.step >= 5 ? fmtINR(c.outcome.verifiedInr) : <span className="muted">—</span>) },
  ];

  // ---- coverage: findings observed in the capture vs findings that carry a case
  const oosObs = d.latest.filter((s) => s.availability === 'out_of_stock').length;
  const nlObs = d.latest.filter((s) => s.availability === 'not_listed').length;
  const gapObs = d.signals.filter((s) => s.metric === 'City price gap').length;
  const discObs = d.signals.filter((s) => s.metric === 'Discount').length;
  const inCases = (k: string, real = true) => cases.filter((c) => c.kind === k && (!real || c.real)).reduce((a, c) => a + c.evidenceCount, 0);
  const coverage = [
    { finding: 'Out-of-stock listings', inCases: Math.min(oosObs, inCases('oos_recovery')), observed: oosObs, real: true },
    { finding: 'Not-listed products', inCases: Math.min(nlObs, inCases('assortment_gap')), observed: nlObs, real: true },
    { finding: 'Packs priced apart across cities', inCases: cases.filter((c) => c.kind === 'price_parity' && c.real).length, observed: gapObs, real: true },
    { finding: 'Discount-depth shifts', inCases: cases.filter((c) => c.kind === 'promo_review' && c.real).length, observed: discObs, real: true },
    { finding: 'Shelves with no Paper Boat result', inCases: cases.filter((c) => c.kind === 'shelf_absence').length, observed: cases.filter((c) => c.kind === 'shelf_absence').length + 3, real: false },
  ];

  const casesTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select value={fState} onChange={setFState} style={{ width: 180 }} aria-label="State" options={[{ value: 'all', label: 'Any state' }, ...FLOW.map((f) => ({ value: f.key, label: f.label })), { value: 'rejected', label: 'Rejected' }]} />
        <Select value={fKind} onChange={setFKind} style={{ width: 240 }} aria-label="Kind" options={[{ value: 'all', label: 'All kinds' }, ...KINDS.map((k) => ({ value: k.key, label: k.label }))]} />
        <Select value={fPlat} onChange={setFPlat} style={{ width: 200 }} aria-label="Platform" options={[{ value: 'all', label: 'All platforms' }, ...platList.map((p) => ({ value: p, label: platformLabel(p) }))]} />
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Switch checked={overdue} onChange={setOverdue} aria-label="Only overdue" /> Only overdue</label>
      </div>
      <Card title="Cases" sub="Every recommendation raised, and where it stands" lift={false} footer={<><span>{filtered.length} of {cases.length} cases</span><Prov>Trigger from capture</Prov><Prov kind="sample">Approval · outcome sample</Prov></>}>
        <Table<OpsCase> rowKey="id" columns={cols} dataSource={filtered} size="middle" scroll={{ x: 1500 }} pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyState text="No case matches these filters." /> }}
          onRow={(c) => ({ onClick: () => setOpenId(c.id), style: { cursor: 'pointer' } })} />
      </Card>
      <Card title="Coverage" sub="How much of each finding on the shelf actually carries a case" lift={false} footer={<><Prov>Shelf capture</Prov><Prov kind="sample">Shelf-absence row sample</Prov></>}>
        <Table size="small" pagination={false} rowKey="finding" dataSource={coverage}
          columns={[
            { title: 'Finding', dataIndex: 'finding' },
            { title: 'In cases', dataIndex: 'inCases', align: 'right' },
            { title: 'Observed', dataIndex: 'observed', align: 'right' },
            { title: 'Coverage', key: 'p', width: 220, render: (_, r) => <Progress percent={r.observed ? Math.round((r.inCases / r.observed) * 100) : 0} size="small" strokeColor="var(--pb-violet)" /> },
            { title: 'Source', key: 's', render: (_, r) => <Tag color={r.real ? 'green' : 'gold'} bordered={false}>{r.real ? 'Real' : 'Sample'}</Tag> },
          ]} />
      </Card>
    </div>
  );

  const stateByKind = KINDS.flatMap((k) => [...FLOW.map((f) => f.label), 'Rejected'].map((st) => ({ kind: k.label, state: st, cases: cases.filter((c) => c.kind === k.key && STATE_LABEL(c.step) === st).length })));
  const flowTab = (
    <div className="bento">
      <Card className="span-7" title="Lifecycle" sub="Cases reaching each state" footer={<><span>{cases.filter((c) => c.step < 0).length} rejected at approval, not shown as a stage</span><Prov kind="sample">Modelled loop</Prov></>}>
        <BarChart data={FLOW.map((f, i) => ({ state: f.label, cases: reach(i) })).reverse()} x="state" y="cases" height={300} />
      </Card>
      <Card className="span-5" title="Where cases stand, by kind" sub={`${KINDS.length} kinds · ${FLOW.length + 1} states`} footer={<Prov kind="sample">Modelled loop</Prov>}>
        <ColumnChart data={stateByKind.filter((r) => r.cases > 0)} x="kind" y="cases" color="state" stack height={300} />
      </Card>
    </div>
  );

  const byKind = KINDS.flatMap((k) => [
    { kind: k.label, measure: 'Verified', inr: cases.filter((c) => c.kind === k.key && c.step >= 5).reduce((a, c) => a + c.outcome.verifiedInr, 0) },
    { kind: k.label, measure: 'Claimed (open)', inr: cases.filter((c) => c.kind === k.key && open(c)).reduce((a, c) => a + c.outcome.claimedInr, 0) },
  ]);
  const byPlat = platList.flatMap((p) => [
    { platform: platformLabel(p), measure: 'Verified', inr: cases.filter((c) => c.platform === p && c.step >= 5).reduce((a, c) => a + c.outcome.verifiedInr, 0) },
    { platform: platformLabel(p), measure: 'Claimed (open)', inr: cases.filter((c) => c.platform === p && open(c)).reduce((a, c) => a + c.outcome.claimedInr, 0) },
  ]);
  const ledgerTab = (
    <div className="bento">
      <Card className="span-12" title="Benefit" sub="Verified against claimed on open cases" footer={<><span>Revenue at the observed offer price, not contribution. Every ₹ scales with the assumed 18 units a day per listing.</span><Prov kind="sample">Sample data · price from capture</Prov></>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { l: 'Verified', v: verifiedInr, n: `${measured.length} measured cases · net ${inrShort(verifiedInr - cost)}`, c: 'var(--pb-mint)' },
            { l: 'Claimed on open cases', v: claimedOpen, n: `${openCases.length} open cases · not yet verified`, c: 'var(--pb-violet)' },
            { l: 'Claimed on measured cases', v: claimedMeasured, n: claimedMeasured ? `${Math.round((verifiedInr / claimedMeasured) * 1000) / 10}% realised` : 'none yet', c: 'var(--pb-sunset)' },
            { l: 'Claim lapsed · rejected', v: cases.filter((c) => c.step < 0).reduce((a, c) => a + c.outcome.claimedInr, 0), n: `${cases.filter((c) => c.step < 0).length} rejected`, c: 'var(--pb-coral)' },
          ].map((x) => (
            <div key={x.l} style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
              <div className="muted" style={{ fontSize: 12.5 }}>{x.l}</div>
              <div className="tnum" style={{ fontSize: 30, fontWeight: 700, color: x.c }}>{inrShort(x.v)}</div>
              <div className="muted" style={{ fontSize: 12 }}>{x.n}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="span-6" title="By kind" sub="Verified and claimed, by kind of case" footer={<Prov kind="sample">Sample data</Prov>}>
        <ColumnChart data={byKind} x="kind" y="inr" color="measure" height={280} formatter={(v) => inrShort(v)} />
      </Card>
      <Card className="span-6" title="By platform" sub="Verified and claimed, by platform" footer={<Prov kind="sample">Sample data</Prov>}>
        <ColumnChart data={byPlat} x="platform" y="inr" color="measure" height={280} formatter={(v) => inrShort(v)} />
      </Card>
      <Card className="span-12" title="Measured cases · claim against readback" sub="The only cases where a rupee figure has been tested" footer={<Prov kind="sample">Sample data</Prov>}>
        <Table size="small" rowKey="id" pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={measured} locale={{ emptyText: <EmptyState text="No case has been measured yet." /> }}
          columns={[
            { title: 'Case', dataIndex: 'id', render: (v: string, c) => <a onClick={() => setOpenId(c.id)}>{v}</a> },
            { title: 'Kind', render: (_, c) => kindLabel(c.kind) },
            { title: 'Where', render: (_, c) => `${platformLabel(c.platform)} · ${c.city}` },
            { title: 'Readback', render: (_, c) => `${c.readback.before} → ${c.readback.after} ${c.readback.unit}` },
            { title: 'Claimed', align: 'right', render: (_, c) => fmtINR(c.outcome.claimedInr) },
            { title: 'Verified', align: 'right', render: (_, c) => fmtINR(c.outcome.verifiedInr) },
            { title: 'Variance', align: 'right', render: (_, c) => { const v = Math.round((c.outcome.verifiedInr / Math.max(1, c.outcome.claimedInr) - 1) * 100); return <span className={v < 0 ? 'delta-down' : 'delta-up'}>{v > 0 ? '+' : ''}{v}%</span>; } },
            { title: 'Net of cost', align: 'right', render: (_, c) => fmtINR(c.outcome.verifiedInr - c.outcome.costInr) },
          ]} />
      </Card>
    </div>
  );

  const attention = cases.filter((c) => isOverdue(c, today) || (c.guard === 'Stale' && c.step <= 1));
  const hist = Array.from(new Set(ttv)).sort((a, b) => a - b).map((x) => ({ days: `${x} d`, cases: ttv.filter((y) => y === x).length }));
  const adoptTab = (
    <div className="bento">
      <Card className="span-7" title="Adoption" sub="What the account teams did with what was recommended" footer={<><span>{approvalRate}% approved · {verifRate}% of submitted verified</span><Prov kind="sample">Modelled loop</Prov></>}>
        <BarChart height={300} x="stage" y="cases" data={[
          { stage: 'Recommended', cases: cases.length }, { stage: 'Approved', cases: approvedN }, { stage: 'Executed', cases: executed }, { stage: 'Verified', cases: reach(4) }, { stage: 'Measured', cases: reach(5) },
          { stage: 'Rejected', cases: cases.filter((c) => c.step < 0).length }, { stage: 'Overdue', cases: cases.filter((c) => isOverdue(c, today)).length },
        ].reverse()} />
      </Card>
      <Card className="span-5" title="Time to verify" sub="Prepared → the platform's own value read back" footer={<Prov kind="sample">Sample data</Prov>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {[['Median', med === null ? '—' : `${med} d`], ['Fastest', ttv.length ? `${ttv[0]} d` : '—'], ['Slowest', ttv.length ? `${ttv[ttv.length - 1]} d` : '—']].map(([l, v]) => (
            <div key={l} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}><div className="tnum" style={{ fontSize: 22, fontWeight: 700 }}>{v}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div>
          ))}
        </div>
        {hist.length ? <ColumnChart data={hist} x="days" y="cases" height={170} /> : <EmptyState text="No case has been read back yet." />}
      </Card>
      <Card className="span-12" title="Needs attention" sub="Overdue against the 10-day due date, and evidence gone stale" footer={<Prov kind="sample">Sample data</Prov>}>
        <Table size="small" rowKey="id" pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={attention} locale={{ emptyText: <EmptyState text="Nothing is overdue or stale." /> }}
          columns={[
            { title: 'Case', dataIndex: 'id', render: (v: string, c) => <a onClick={() => setOpenId(c.id)}>{v}</a> },
            { title: 'What', dataIndex: 'title' },
            { title: 'State', render: (_, c) => STATE_LABEL(c.step) },
            { title: 'Owner', dataIndex: 'owner' },
            { title: 'Why', render: (_, c) => <span>{isOverdue(c, today) && <Tag color="red" bordered={false}>Overdue</Tag>}{c.guard === 'Stale' && <Tag color="gold" bordered={false}>Stale evidence</Tag>}</span> },
            { title: 'Due', render: (_, c) => fmtDate(c.dueAt) },
          ]} />
      </Card>
    </div>
  );

  const cur = byId(openId);
  return (
    <>
      <PageHead title="Value & Outcomes" sub="Every recommendation from trigger to approval, execution, readback and measured outcome" actions={<Button type="primary" onClick={exportLedger}>Export ledger</Button>} />
      <Tiles
        items={[
          { label: 'Benefit verified', value: inrShort(verifiedInr), icon: <BankOutlined />, tone: 'good', note: `${measured.length} measured cases · net ${inrShort(verifiedInr - cost)}` },
          { label: 'Benefit claimed · open', value: inrShort(claimedOpen), icon: <LineChartOutlined />, note: `${openCases.length} open cases · not verified` },
          { label: 'Verified changes', value: reach(4), icon: <CheckCircleOutlined />, note: `read back on the platform · ${executed} submitted` },
          { label: 'Cases', value: cases.length, icon: <FileDoneOutlined />, note: `${KINDS.length} kinds · ${platList.length} platform${platList.length === 1 ? '' : 's'}` },
          { label: 'Median time to verify', value: med === null ? '—' : `${med} d`, icon: <FieldTimeOutlined />, note: ttv.length ? `${ttv[0]}–${ttv[ttv.length - 1]} d · n=${ttv.length}` : 'none read back' },
          { label: 'Adoption', value: `${approvalRate}%`, icon: <TeamOutlined />, note: `approved · ${verifRate}% of submitted verified` },
        ]}
      />
      {cases.length === 0 ? (
        <EmptyState text="No cases for these filters." />
      ) : (
        <UrlTabs
          items={[
            { key: 'cases', label: `Cases ${cases.length}`, children: casesTab },
            { key: 'flow', label: 'Lifecycle', children: flowTab },
            { key: 'ledger', label: 'Benefit ledger', children: ledgerTab },
            { key: 'adopt', label: 'Adoption', children: adoptTab },
          ]}
        />
      )}
      <ValueDrawer
        c={cur}
        open={!!cur && !!openId}
        onClose={() => setOpenId(null)}
        query={query}
        onNext={() => { if (cur) { const n = applyNext(cur, today); put(n); message.success(`${cur.id}: ${STATE_LABEL(n.step)}${n.sent && !cur.sent ? ' — sent for approval' : ''}${n.closed ? ' — closed' : ''}`); } }}
        onReject={() => { if (cur) { put(rejectCase(cur, today)); message.info(`${cur.id} rejected`); } }}
        onEvidence={() => setEvId(cur?.id ?? null)}
      />
      <EvidenceModal c={byId(evId)} latest={d.latest} onClose={() => setEvId(null)} />
    </>
  );
}
