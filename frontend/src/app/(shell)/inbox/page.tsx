'use client';

import { Button, Modal, Select, Switch, Table, Tabs, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClockCircleOutlined, FieldTimeOutlined, InboxOutlined, SafetyOutlined, SendOutlined, WarningOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BarChart } from '@/components/charts';
import { EvidenceModal } from '@/components/ops/EvidenceModal';
import { Tiles } from '@/components/ops/Tiles';
import { Card, EmptyState, ErrorState, PageHead, PlatformTag, CityTag, Prov, SkeletonBlock, fmtINR } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { useSignals } from '@/hooks/useSignals';
import { platformLabel } from '@/lib/config';
import {
  approveAndSubmit, bucketOf, buildCases, daysToVerify, FLOW, isOverdue, KINDS, kindLabel, needsYou, rejectCase, reassignCase, STATE_LABEL, stepAt, type OpsCase,
} from '@/mock/ops-cases';
import { anchorsOf, dayDiff, fmtDate } from '@/mock/ops-common';
import { CaseDrawer } from './parts/CaseDrawer';

type Tab = 'todo' | 'platform' | 'verified' | 'closed' | 'all';
const TONE: Record<number, string> = { '-1': 'red', 0: 'orange', 1: 'purple', 2: 'blue', 3: 'blue', 4: 'green', 5: 'green' };

const DELEGATION = [
  { rule: 'Out-of-stock recovery under ₹1.8 L', who: 'Key account manager approves', on: true },
  { rule: 'Price parity correction within ±5% of MRP', who: 'Revenue growth manager approves', on: true },
  { rule: 'Any change above ₹5 L or outside the pricing corridor', who: 'Head of e-commerce approves', on: true },
  { rule: 'New listing requests', who: 'Catalogue manager approves', on: false },
];

export default function Page() {
  const { platforms, cities, query } = useFilters();
  const d = useSignals();
  const ds = useDataset();
  const [tab, setTab] = useState<Tab>('todo');
  const [stage, setStage] = useState('all');
  const [kind, setKind] = useState('all');
  const [owner, setOwner] = useState('all');
  const [plat, setPlat] = useState('all');
  const [sort, setSort] = useState('due');
  const [edits, setEdits] = useState<Record<string, OpsCase>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [delegOpen, setDelegOpen] = useState(false);
  const [deleg, setDeleg] = useState(DELEGATION);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState('Key account manager');

  const capturedAt = d.meta?.captured_at ?? '';
  const today = capturedAt.slice(0, 10);
  const base = useMemo(() => buildCases({ signals: d.signals, latest: d.latest, anchors: anchorsOf(d.latest), platforms, cities, capturedAt }), [d.signals, d.latest, platforms, cities, capturedAt]);
  const cases = useMemo(() => base.map((c) => edits[c.id] ?? c), [base, edits]);

  if (d.isLoading) return (<><PageHead title="Inbox" /><SkeletonBlock h={420} /></>);
  if (d.isError) return (<><PageHead title="Inbox" /><ErrorState onRetry={() => d.refetch()} /></>);

  const put = (c: OpsCase) => setEdits((m) => ({ ...m, [c.id]: c }));
  const byId = (id: string | null) => cases.find((c) => c.id === id) ?? null;
  const reached = (i: number) => cases.filter((c) => c.step >= i || i === 0).length;
  const todo = cases.filter((c) => c.step === 1);
  const withPlatform = cases.filter((c) => bucketOf(c) === 'platform');
  const readBack = cases.filter((c) => c.step === 4);
  const tt = cases.map(daysToVerify).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const median = tt.length ? tt[Math.floor(tt.length / 2)] : null;
  const stale = cases.filter((c) => c.guard === 'Stale');

  const shown = cases
    .filter((c) => (tab === 'all' || bucketOf(c) === tab) && (stage === 'all' || (c.step < 0 ? 'rejected' : FLOW[c.step].key) === stage) && (kind === 'all' || c.kind === kind) && (owner === 'all' || c.owner === owner) && (plat === 'all' || c.platform === plat))
    .sort((a, b) => (sort === 'value' ? b.outcome.claimedInr - a.outcome.claimedInr : sort === 'age' ? (a.raisedAt < b.raisedAt ? -1 : 1) : sort === 'state' ? a.step - b.step : (isOverdue(a, today) ? 0 : 1) - (isOverdue(b, today) ? 0 : 1) || (a.dueAt < b.dueAt ? -1 : 1)));

  const tabCount = (t: Tab) => (t === 'all' ? cases.length : cases.filter((c) => bucketOf(c) === t).length);
  const goto = (t: Tab, st = 'all') => { setTab(t); setStage(st); setPicked([]); };

  const doApprove = (c: OpsCase) => {
    put(approveAndSubmit(c, today));
    message.success(`${c.id} approved and submitted to ${platformLabel(c.platform)}`);
  };
  const chase = (c: OpsCase) => { put({ ...c, chased: c.chased + 1 }); message.success(`Chase sent to ${platformLabel(c.platform)} for ${c.route.ref ?? c.id}`); };
  const escalate = (c: OpsCase) => message.warning(`${c.id} escalated to the ${platformLabel(c.platform)} regional lead`);
  const bulk = (what: 'approve' | 'assign' | 'clear') => {
    if (what === 'clear') { setPicked([]); return; }
    if (what === 'assign') { setReassignOpen(true); return; }
    const sel = cases.filter((c) => picked.includes(c.id) && needsYou(c) && c.guard !== 'Stale');
    setEdits((m) => { const n = { ...m }; sel.forEach((c) => { n[c.id] = approveAndSubmit(c, today); }); return n; });
    setPicked([]);
    message.success(`${sel.length} decision${sel.length === 1 ? '' : 's'} approved and submitted`);
  };

  const cur = byId(openId);
  const lateOnes = withPlatform.filter((c) => isOverdue(c, today));
  const owners = Array.from(new Set(cases.map((c) => c.owner))).sort();
  const platsInCases = Array.from(new Set(cases.map((c) => c.platform)));

  const cols: ColumnsType<OpsCase> = [
    { title: 'Decision', key: 'd', width: 330, render: (_, c) => (
      <div>
        <div style={{ fontWeight: 600 }}>{c.title}</div>
        <div className="muted" style={{ fontSize: 12 }}>{c.id} · {kindLabel(c.kind)} <Tag color={c.priority === 'P1' ? 'red' : c.priority === 'P2' ? 'orange' : 'default'} bordered={false} style={{ marginInlineStart: 6 }}>{c.priority}</Tag>{c.guard === 'Stale' && <Tag color="gold" bordered={false}>Guard stale</Tag>}</div>
      </div>) },
    { title: 'Platform', key: 'p', render: (_, c) => <div><PlatformTag id={c.platform} /> <CityTag city={c.city.split(' + ')[0]} /></div> },
    { title: 'Submitted', key: 's', render: (_, c) => (c.route.submittedAt ? <span className="tnum">{fmtDate(c.route.submittedAt)}<div className="muted" style={{ fontSize: 12 }}>{c.route.acknowledgedAt ? `ack ${fmtDate(c.route.acknowledgedAt)}` : 'not acknowledged'}</div></span> : <span className="muted">Not submitted</span>) },
    { title: 'Platform reference', key: 'r', render: (_, c) => (c.route.ref ? <code>{c.route.ref}</code> : c.route.submittedAt ? <Tag color="gold" bordered={false}>Not returned yet</Tag> : <span className="muted">—</span>) },
    { title: 'Waiting', key: 'w', align: 'right', render: (_, c) => {
      if (c.route.submittedAt && c.step <= 3) { const w = dayDiff(c.route.submittedAt, today); return <span className="tnum" style={{ color: isOverdue(c, today) ? 'var(--pb-coral)' : undefined }}>{w} d</span>; }
      if (c.step <= 1 && c.step >= 0) return <span className="tnum" style={{ color: isOverdue(c, today) ? 'var(--pb-coral)' : undefined }}>{isOverdue(c, today) ? `overdue ${dayDiff(c.dueAt, today)} d` : `due ${fmtDate(c.dueAt)}`}</span>;
      return <span className="muted">—</span>;
    } },
    { title: 'Reads back', key: 'rb', render: (_, c) => <span><code>{c.readback.field}</code><div className="muted" style={{ fontSize: 12 }}>{c.readback.before} {c.readback.unit} at capture</div></span> },
    { title: 'Status', key: 'st', render: (_, c) => <Tag color={TONE[c.step]} bordered={false}>{STATE_LABEL(c.step)}</Tag> },
    { title: '', key: 'a', fixed: 'right', render: (_, c) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        {needsYou(c) && <Button size="small" type="primary" disabled={c.guard === 'Stale'} onClick={(e) => { e.stopPropagation(); doApprove(c); }}>Approve &amp; submit</Button>}{' '}
        <Button size="small" onClick={(e) => { e.stopPropagation(); setEvidenceId(c.id); }}>Evidence</Button>{' '}
        {bucketOf(c) === 'platform' && <Button size="small" type="text" onClick={(e) => { e.stopPropagation(); chase(c); }}>Chase</Button>}
      </span>) },
  ];

  return (
    <>
      <PageHead
        title="Inbox"
        sub="Decisions prepared for a person — and what is still owed after the approval"
        actions={
          <>
            <Button onClick={() => setDelegOpen(true)}>Delegation rules</Button>
            <Link href={`/value${query}`}><Button>Value &amp; Outcomes</Button></Link>
            <Link href={`/assistant${query}`}><Button type="primary">Ask the Assistant</Button></Link>
          </>
        }
      />
      <Tiles
        items={[
          { label: 'Waiting on you', value: cases.filter(needsYou).length, icon: <InboxOutlined />, note: 'approve or submit' },
          { label: 'Past the response time', value: cases.filter((c) => isOverdue(c, today)).length, icon: <ClockCircleOutlined />, tone: 'bad', note: '10 days from prepared' },
          { label: 'Guard stale', value: stale.length, icon: <WarningOutlined />, tone: stale.length ? 'warn' : undefined, note: 'evidence older than 14 days' },
          { label: 'With the platform', value: withPlatform.length, icon: <SendOutlined />, note: 'submitted, not read back' },
          { label: 'Read back, not measured', value: readBack.length, icon: <SafetyOutlined />, note: 'outcome window still open' },
          { label: 'Median prepared → verified', value: median === null ? '—' : `${median} d`, icon: <FieldTimeOutlined />, note: `${tt.length} of ${cases.length} read back` },
        ]}
      />

      {cases.length === 0 ? <EmptyState text="No decisions for these filters." /> : (
        <>
          <div className="bento" style={{ marginBottom: 20 }}>
            <Card className="span-5" title="Where the loop stands" sub="Decisions that have reached each stage" footer={<><span>{cases.length} prepared · {reached(1)} approved · {cases.filter((c) => c.step < 0).length} rejected · {cases.filter((c) => c.step === 0).length} awaiting approval</span><Prov>Trigger from capture</Prov><Prov kind="sample">Modelled loop</Prov></>}>
              <BarChart data={FLOW.map((f, i) => ({ stage: f.label, decisions: reached(i) })).reverse()} x="stage" y="decisions" height={250} />
            </Card>
            <Card className="span-7" title="Still owed after approval" sub="An approval is the middle of the loop, not the end"
              actions={<Button size="small" disabled={!lateOnes.length} onClick={() => message.success(`Chase drafted for ${lateOnes.length} overdue decision${lateOnes.length === 1 ? '' : 's'}: ${lateOnes.map((c) => c.id).join(', ')}`)}>Chase the {lateOnes.length} overdue with the platform</Button>}
              footer={<Link href={`/value${query}`}>See the outcomes ledger</Link>}>
              {[
                { t: 'todo' as Tab, st: 'approved', n: todo.length, l: 'Approved, not submitted', s: 'nothing has reached the platform yet' },
                { t: 'platform' as Tab, st: 'all', n: withPlatform.length, l: 'Submitted, awaiting readback', s: `${withPlatform.filter((c) => !c.route.ref).length} without a platform reference` },
                { t: 'verified' as Tab, st: 'all', n: readBack.length, l: 'Read back, outcome not measured', s: 'measured over 14 days from the readback' },
              ].map((o) => (
                <button key={o.l} type="button" onClick={() => goto(o.t, o.st)} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 12, alignItems: 'center', padding: '12px 4px', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
                  <span className="tnum" style={{ fontSize: 24, fontWeight: 700, textAlign: 'center' }}>{o.n}</span>
                  <span><b style={{ display: 'block' }}>{o.l}</b><span className="muted" style={{ fontSize: 12 }}>{o.s}</span></span>
                  <Tag bordered={false}>Open</Tag>
                </button>
              ))}
            </Card>
          </div>

          <Tabs
            activeKey={tab}
            onChange={(k) => goto(k as Tab)}
            items={([['todo', 'To decide'], ['platform', 'With the platform'], ['verified', 'Read back'], ['closed', 'Closed'], ['all', 'All']] as [Tab, string][]).map(([k, label]) => ({ key: k, label: `${label} ${tabCount(k)}` }))}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Select value={stage} onChange={setStage} style={{ width: 170 }} aria-label="Stage" options={[{ value: 'all', label: 'Any stage' }, ...[...FLOW.map((f) => ({ value: f.key, label: f.label })), { value: 'rejected', label: 'Rejected' }]]} />
            <Select value={kind} onChange={setKind} style={{ width: 230 }} aria-label="Decision type" options={[{ value: 'all', label: 'All types' }, ...KINDS.map((k) => ({ value: k.key, label: k.label }))]} />
            <Select value={owner} onChange={setOwner} style={{ width: 230 }} aria-label="Owner" options={[{ value: 'all', label: 'Me and my team' }, ...owners.map((o) => ({ value: o, label: o }))]} />
            <Select value={plat} onChange={setPlat} style={{ width: 190 }} aria-label="Platform" options={[{ value: 'all', label: 'All platforms' }, ...platsInCases.map((p) => ({ value: p, label: platformLabel(p) }))]} />
            <Select value={sort} onChange={setSort} style={{ width: 170 }} aria-label="Sort" options={[{ value: 'due', label: 'Response time' }, { value: 'value', label: 'Value claimed' }, { value: 'age', label: 'Oldest first' }, { value: 'state', label: 'Stage in the loop' }]} />
          </div>
          <Card lift={false} footer={<><span>Showing {shown.length} of {cases.length} decisions</span><Link href={`/workflows${query}`}>the watches that raised them</Link><Link href={`/value${query}`}>the ledger they end in</Link></>}>
            {picked.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', marginBottom: 8, borderRadius: 12, background: 'var(--raised)', flexWrap: 'wrap' }}>
                <b>{picked.length} selected</b><span style={{ flex: 1 }} />
                <Button size="small" type="primary" onClick={() => bulk('approve')}>Approve &amp; submit</Button>
                <Button size="small" onClick={() => bulk('assign')}>Reassign</Button>
                <Button size="small" type="text" onClick={() => bulk('clear')}>Clear</Button>
              </div>
            )}
            <Table<OpsCase>
              rowKey="id"
              size="middle"
              columns={cols}
              dataSource={shown}
              scroll={{ x: 1100 }}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{ emptyText: <EmptyState text="No decision matches this tab and these filters." /> }}
              rowSelection={{ selectedRowKeys: picked, onChange: (k) => setPicked(k as string[]), getCheckboxProps: (c) => ({ disabled: !needsYou(c), 'aria-label': `Select ${c.id}` }) }}
              onRow={(c) => ({ onClick: () => setOpenId(c.id), style: { cursor: 'pointer' } })}
            />
          </Card>
        </>
      )}

      <CaseDrawer
        c={cur}
        open={!!cur && !!openId}
        onClose={() => setOpenId(null)}
        today={today}
        query={query}
        acts={{
          approveSubmit: () => cur && doApprove(cur),
          reassign: (o) => { if (cur) { put(reassignCase(cur, o)); message.success(`${cur.id} reassigned to ${o}`); } },
          clear: () => { if (cur) { put(rejectCase(cur, today)); message.info(`${cur.id} cleared — not executed`); setOpenId(null); } },
          evidence: () => cur && setEvidenceId(cur.id),
          chase: () => cur && chase(cur),
          escalate: () => cur && escalate(cur),
        }}
      />
      <EvidenceModal c={byId(evidenceId)} latest={ds.latest} onClose={() => setEvidenceId(null)} />

      <Modal title="Delegation rules" open={delegOpen} onCancel={() => setDelegOpen(false)} onOk={() => { setDelegOpen(false); message.success('Delegation rules saved'); }} okText="Save" width={680}>
        <p className="muted">Who may approve what without escalating. <Prov kind="sample">Sample data</Prov></p>
        <Table size="small" pagination={false} rowKey="rule" dataSource={deleg}
          columns={[{ title: 'Rule', dataIndex: 'rule' }, { title: 'Decision', dataIndex: 'who' }, { title: 'Active', dataIndex: 'on', width: 80, render: (v: boolean, r) => <Switch checked={v} aria-label={`Toggle ${r.rule}`} onChange={(x) => setDeleg((a) => a.map((y) => (y.rule === r.rule ? { ...y, on: x } : y)))} /> }]} />
        <p className="muted" style={{ marginTop: 8 }}>Auto-approval ceiling today: {fmtINR(180000)} per decision.</p>
      </Modal>
      <Modal title={`Reassign ${picked.length} decision${picked.length === 1 ? '' : 's'}`} open={reassignOpen} onCancel={() => setReassignOpen(false)} okText="Reassign"
        onOk={() => { setEdits((m) => { const n = { ...m }; cases.filter((c) => picked.includes(c.id)).forEach((c) => { n[c.id] = reassignCase(c, reassignTo); }); return n; }); setReassignOpen(false); message.success(`Reassigned to ${reassignTo}`); setPicked([]); }}>
        <Select value={reassignTo} onChange={setReassignTo} style={{ width: '100%' }} options={['Key account manager', 'Revenue growth manager', 'Catalogue manager', 'Supply planner', 'Marketplace ops', 'Head of e-commerce'].map((o) => ({ value: o, label: o }))} aria-label="New owner" />
      </Modal>
    </>
  );
}
