'use client';

import { Button, Input, InputNumber, Modal, Select, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AlertOutlined, BellOutlined, DatabaseOutlined, NotificationOutlined, SafetyOutlined, TeamOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { BarChart, DonutChart } from '@/components/charts';
import { Tiles } from '@/components/ops/Tiles';
import { Card, EmptyState, ErrorState, fmtIST, PageHead, Prov, SevTag, SkeletonBlock } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { CHANNELS, evaluate, FREQUENCIES, MODULES, OWNER_ROLES, RULES, type Evaluation, type RuleDef } from '@/mock/ops-alerts';
import { anchorsOf } from '@/mock/ops-common';
import { NewRuleModal } from './parts/NewRuleModal';

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
type Row = RuleDef & { ev: Evaluation; on: boolean; thr: number | undefined };

export default function Page() {
  const { platforms, cities } = useFilters();
  const d = useDataset();
  const [custom, setCustom] = useState<RuleDef[]>([]);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [thr, setThr] = useState<Record<string, number>>({});
  const [chan, setChan] = useState<Record<string, string>>({});
  const [freq, setFreq] = useState<Record<string, string>>({});
  const [ran, setRan] = useState<Record<string, string>>({});
  const [fMod, setFMod] = useState('all');
  const [fSev, setFSev] = useState('all');
  const [fOwn, setFOwn] = useState('all');
  const [fChan, setFChan] = useState('all');
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const capturedAt = d.meta?.captured_at ?? '';
  const ctx = useMemo(() => ({ snapshots: d.snapshots, latest: d.latest, intervals: d.intervals, anchors: anchorsOf(d.latest), platforms, cities }), [d.snapshots, d.latest, d.intervals, platforms, cities]);
  const rows: Row[] = useMemo(
    () => [...RULES, ...custom].map((r) => {
      const t = thr[r.id] ?? r.threshold?.value;
      const merged = { ...r, channel: chan[r.id] ?? r.channel, frequency: freq[r.id] ?? r.frequency };
      return { ...merged, ev: evaluate(merged, ctx, t), on: on[r.id] ?? true, thr: t };
    }),
    [custom, thr, chan, freq, on, ctx],
  );

  if (d.isLoading) return (<><PageHead title="Alerts & Subscriptions" /><SkeletonBlock h={420} /></>);
  if (d.isError) return (<><PageHead title="Alerts & Subscriptions" /><ErrorState onRetry={() => d.refetch()} /></>);

  const enabled = rows.filter((r) => r.on);
  const total = enabled.reduce((a, r) => a + r.ev.matches, 0);
  const byMod = MODULES.map((m) => { const rs = enabled.filter((r) => r.module === m); return { module: m, rules: rs.length, matches: rs.reduce((a, r) => a + r.ev.matches, 0), top: rs.filter((r) => r.ev.matches).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])[0]?.severity }; });
  const bySev = (['critical', 'high', 'medium', 'low'] as const).map((s) => { const rs = enabled.filter((r) => r.severity === s); return { severity: s, rules: rs.length, matches: rs.reduce((a, r) => a + r.ev.matches, 0) }; });
  const channelsInUse = Array.from(new Set(enabled.map((r) => r.channel)));
  const shown = rows.filter((r) => (fMod === 'all' || r.module === fMod) && (fSev === 'all' || r.severity === fSev) && (fOwn === 'all' || r.owner === fOwn) && (fChan === 'all' || r.channel === fChan) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));

  const runNow = (r: Row) => { setRan((m) => ({ ...m, [r.id]: capturedAt })); message.success(`"${r.name}" ran on the latest capture: ${r.ev.matches} match${r.ev.matches === 1 ? '' : 'es'} of ${r.ev.population} ${r.popUnit}`); };
  const exportBook = () => {
    const blob = new Blob([JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, module: r.module, severity: r.severity, owner: r.owner, channel: r.channel, frequency: r.frequency, threshold: r.threshold ? { ...r.threshold, value: r.thr } : null, enabled: r.on, matches: r.ev.matches, source: r.real ? 'evaluated on capture' : 'sample' })), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alert-rule-book.json';
    a.click();
    URL.revokeObjectURL(a.href);
    message.success(`Exported ${rows.length} rules`);
  };

  const srcTag = (r: Row) => <Tag color={r.real ? 'green' : 'gold'} bordered={false}>{r.real ? 'Real' : 'Sample'}</Tag>;
  const cols: ColumnsType<Row> = [
    { title: 'Rule', key: 'n', width: 340, render: (_, r) => <div><b>{r.name}</b>{r.base && <Tag bordered={false} style={{ marginInlineStart: 6 }}>Custom</Tag>}<div className="muted" style={{ fontSize: 12 }}>{r.scope} · {r.owner}</div></div> },
    { title: 'Module', dataIndex: 'module' },
    { title: 'Severity', key: 'sv', render: (_, r) => <SevTag v={r.severity} /> },
    { title: 'Matches', key: 'm', align: 'right', render: (_, r) => <span className="tnum"><b>{r.on ? r.ev.matches : 0}</b> of {r.ev.population} {srcTag(r)}</span> },
    { title: 'Channel', dataIndex: 'channel', render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
    { title: 'Cadence', dataIndex: 'frequency' },
    { title: 'On', key: 'on', render: (_, r) => <Switch checked={r.on} aria-label={`Enable ${r.name}`} onChange={(v) => { setOn((m) => ({ ...m, [r.id]: v })); message.success(`${r.name} ${v ? 'enabled' : 'paused'}`); }} /> },
  ];

  const previewRow = rows.find((r) => r.id === preview) ?? null;

  // subscriptions: roles -> rules they receive
  const subs = OWNER_ROLES.map((o) => { const rs = enabled.filter((r) => r.owner === o); return { owner: o, rules: rs.length, channels: Array.from(new Set(rs.map((r) => r.channel))), crit: rs.filter((r) => r.severity === 'critical').length, matches: rs.reduce((a, r) => a + r.ev.matches, 0) }; }).filter((s) => s.rules > 0);
  const digest = enabled.filter((r) => r.ev.matches > 0 && /digest|Slack|in-app/.test(r.channel)).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.ev.matches - a.ev.matches).slice(0, 6);

  return (
    <>
      <PageHead
        title="Alerts & Subscriptions"
        sub={`Rules evaluated on the capture of ${capturedAt ? fmtIST(capturedAt) : '—'} · shelf rules are observed, search / competitor / ratings rules are sample`}
        actions={<><Button onClick={exportBook}>Export rule book</Button><Button type="primary" onClick={() => setNewOpen(true)}>New rule</Button></>}
      />
      <Tiles
        items={[
          { label: 'Rules enabled', value: enabled.length, icon: <BellOutlined />, note: `${rows.length - enabled.length} paused` },
          { label: 'Matches now', value: total, icon: <AlertOutlined />, note: 'across enabled rules' },
          { label: 'Critical firing', value: enabled.filter((r) => r.severity === 'critical' && r.ev.matches > 0).length, icon: <SafetyOutlined />, tone: 'bad', note: `of ${enabled.filter((r) => r.severity === 'critical').length} critical rules` },
          { label: 'Evaluated on capture', value: enabled.filter((r) => r.real).length, icon: <DatabaseOutlined />, note: `${enabled.filter((r) => !r.real).length} sample rules` },
          { label: 'Channels in use', value: channelsInUse.length, icon: <NotificationOutlined />, note: channelsInUse.slice(0, 2).join(' · ') },
          { label: 'Roles subscribed', value: subs.length, icon: <TeamOutlined />, note: `${enabled.length} subscriptions` },
        ]}
      />

      <div className="bento">
        <div className="sec-head"><b>Where the rules sit</b><span className="muted" style={{ fontSize: 13 }}>Every rule belongs to one module and one severity; both drive who is told and how fast</span></div>
        <Card className="span-7" title="By module" sub="Rules and matches in each module" footer={<><Prov>Shelf rules from capture</Prov><Prov kind="sample">Search / competitor sample</Prov><span className="muted" style={{ fontSize: 12 }}>Select a module to filter the rule list</span></>}>
          <BarChart data={byMod.map((m) => ({ module: m.module, matches: m.matches }))} x="module" y="matches" height={220} />
          <Table size="small" pagination={false} rowKey="module" dataSource={byMod} onRow={(m) => ({ onClick: () => setFMod(fMod === m.module ? 'all' : m.module), style: { cursor: 'pointer', background: fMod === m.module ? 'var(--raised)' : undefined } })}
            columns={[{ title: 'Module', dataIndex: 'module' }, { title: 'Rules', dataIndex: 'rules', align: 'right' }, { title: 'Matches', dataIndex: 'matches', align: 'right' }, { title: 'Top severity', dataIndex: 'top', render: (v) => (v ? <SevTag v={v} /> : <span className="muted">—</span>) }]} />
        </Card>
        <Card className="span-5" title="By severity" sub="Matches in this capture, not rules" footer={<><Prov>Shelf rules from capture</Prov><Prov kind="sample">Others sample</Prov></>}>
          {total ? <DonutChart data={bySev.filter((s) => s.matches > 0).map((s) => ({ severity: s.severity, matches: s.matches }))} angle="matches" color="severity" height={220} /> : <EmptyState text="No rule matches." />}
          <Table size="small" pagination={false} rowKey="severity" dataSource={bySev} onRow={(s) => ({ onClick: () => setFSev(fSev === s.severity ? 'all' : s.severity), style: { cursor: 'pointer', background: fSev === s.severity ? 'var(--raised)' : undefined } })}
            columns={[{ title: 'Severity', dataIndex: 'severity', render: (v) => <SevTag v={v} /> }, { title: 'Rules', dataIndex: 'rules', align: 'right' }, { title: 'Matches', dataIndex: 'matches', align: 'right' }]} />
        </Card>

        <div className="sec-head"><b>Rules</b><span className="muted" style={{ fontSize: 13 }}>The engine — one row per rule, its threshold, and the evidence behind its count</span></div>
        <Card className="span-12" title="Rule list" sub={`${shown.length} of ${rows.length} rules`} lift={false}
          actions={<span style={{ display: 'flex', gap: 8 }}><Button size="small" onClick={() => { setOn(Object.fromEntries(rows.map((r) => [r.id, true]))); message.success('All rules enabled'); }}>Enable all</Button><Button size="small" type="primary" onClick={() => setNewOpen(true)}>New rule</Button></span>}
          footer={<><Prov>Match counts re-evaluated live on the capture</Prov><Prov kind="sample">Sample rules marked</Prov></>}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Select value={fMod} onChange={setFMod} style={{ width: 200 }} aria-label="Module" options={[{ value: 'all', label: 'All modules' }, ...MODULES.map((m) => ({ value: m, label: m }))]} />
            <Select value={fSev} onChange={setFSev} style={{ width: 140 }} aria-label="Severity" options={[{ value: 'all', label: 'All severities' }, ...['critical', 'high', 'medium', 'low'].map((v) => ({ value: v, label: v }))]} />
            <Select value={fOwn} onChange={setFOwn} style={{ width: 190 }} aria-label="Owner" options={[{ value: 'all', label: 'Any owner' }, ...OWNER_ROLES.map((o) => ({ value: o, label: o }))]} />
            <Select value={fChan} onChange={setFChan} style={{ width: 190 }} aria-label="Channel" options={[{ value: 'all', label: 'Any channel' }, ...CHANNELS.map((o) => ({ value: o, label: o }))]} />
            <span style={{ flex: 1 }} />
            <Input.Search allowClear placeholder="Search rules" style={{ width: 240 }} onChange={(e) => setQ(e.target.value)} aria-label="Search rules" />
          </div>
          <Table<Row> rowKey="id" size="middle" columns={cols} dataSource={shown} scroll={{ x: 1100 }} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <EmptyState text="No rule matches these filters." /> }}
            expandable={{
              expandedRowRender: (r) => (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div className="sec">{r.evaluates}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {r.threshold ? (
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{r.threshold.label} {r.threshold.op}
                        <InputNumber size="small" min={r.threshold.min} max={r.threshold.max} step={r.threshold.step} value={r.thr} onChange={(v) => v !== null && setThr((m) => ({ ...m, [r.id]: v }))} aria-label={`Threshold for ${r.name}`} /> {r.threshold.unit}</label>
                    ) : <span className="muted">Fixed condition — no threshold to edit.</span>}
                    <Select size="small" value={r.channel} onChange={(v) => setChan((m) => ({ ...m, [r.id]: v }))} style={{ width: 180 }} aria-label="Channel" options={CHANNELS.map((o) => ({ value: o, label: o }))} />
                    <Select size="small" value={r.frequency} onChange={(v) => setFreq((m) => ({ ...m, [r.id]: v }))} style={{ width: 160 }} aria-label="Cadence" options={FREQUENCIES.map((o) => ({ value: o, label: o }))} />
                    <Button size="small" type="primary" onClick={() => runNow(r)}>Run this rule now</Button>
                    <Button size="small" onClick={() => setPreview(r.id)}>Preview rows</Button>
                    {ran[r.id] && <span className="muted" style={{ fontSize: 12 }}>last run {fmtIST(ran[r.id])}</span>}
                  </div>
                  {r.ev.rows.slice(0, 3).map((e) => <div key={e.t + e.s} style={{ fontSize: 12.5 }}><b>{e.t}</b> · <span className="muted">{e.s}</span> · {e.v}</div>)}
                </div>
              ),
            }} />
        </Card>

        <div className="sec-head"><b>Subscriptions</b><span className="muted" style={{ fontSize: 13 }}>Who is told, on which channel, and what today&apos;s send would carry</span></div>
        <Card className="span-7" title="Who receives what" sub="Built from the owner and channel on each rule · roles, not named recipients" footer={<><span>{subs.length} roles · {enabled.length} subscriptions · {channelsInUse.length} channels in use</span><Prov kind="sample">Sample data</Prov></>}>
          <Table size="small" pagination={false} rowKey="owner" dataSource={subs} locale={{ emptyText: <EmptyState text="No rule is enabled." /> }}
            columns={[
              { title: 'Role', dataIndex: 'owner' },
              { title: 'Rules', dataIndex: 'rules', align: 'right' },
              { title: 'Critical', dataIndex: 'crit', align: 'right' },
              { title: 'Matches', dataIndex: 'matches', align: 'right' },
              { title: 'Channels', dataIndex: 'channels', render: (v: string[]) => v.map((c) => <Tag key={c} bordered={false}>{c}</Tag>) },
            ]} />
        </Card>
        <Card className="span-5" title="07:30 daily digest — preview" sub="What today's send would carry" footer={<><Button type="primary" size="small" onClick={() => message.success('Test digest sent to you')}>Send me a test</Button><Prov>Real matches</Prov><Prov kind="sample">Sample rules</Prov></>}>
          {digest.length === 0 ? <EmptyState text="Nothing to send today." /> : digest.map((r) => (
            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><SevTag v={r.severity} /><b style={{ flex: 1 }}>{r.name}</b><span className="tnum">{r.ev.matches}</span></div>
              {r.ev.rows[0] && <div className="muted" style={{ fontSize: 12 }}>{r.ev.rows[0].t} · {r.ev.rows[0].s} · {r.ev.rows[0].v}</div>}
            </div>
          ))}
        </Card>
      </div>

      <NewRuleModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={(r) => { setCustom((c) => [...c, r]); setNewOpen(false); message.success(`Rule "${r.name}" created and enabled`); }} />
      <Modal open={!!previewRow} onCancel={() => setPreview(null)} footer={null} width={760} title={previewRow ? `Preview rows · ${previewRow.name}` : ''}>
        {previewRow && (
          <>
            <p className="muted">{previewRow.ev.matches} match{previewRow.ev.matches === 1 ? '' : 'es'} of {previewRow.ev.population} {previewRow.popUnit}. {previewRow.real ? <Prov>Shelf capture</Prov> : <Prov kind="sample">Sample data</Prov>}</p>
            <Table size="small" rowKey={(e) => e.t + e.s + e.v} dataSource={previewRow.ev.rows} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <EmptyState text="No row matches at this threshold." /> }}
              columns={[{ title: 'What', dataIndex: 't' }, { title: 'Where', dataIndex: 's' }, { title: 'Why it matched', dataIndex: 'v' }]} />
          </>
        )}
      </Modal>
    </>
  );
}
