'use client';

import { Button, Form, Input, InputNumber, Modal, Segmented, Select, Table, Tag, message } from 'antd';
import { AlertOutlined, BellOutlined, CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, EmptyState, ErrorState, fmtIST, PageHead, Prov, SevTag, SkeletonBlock } from '@/components/ui';
import { Tiles } from '@/components/ops/Tiles';
import { platformLabel } from '@/lib/config';
import { useFilters } from '@/hooks/useFilters';
import { useSignals } from '@/hooks/useSignals';
import { anchorsOf, inrShort } from '@/mock/ops-common';
import { enrichReal, OWNERS, SEV_ORDER, SEVERITY_BANDS, sampleSignals, SIGNAL_TYPES, type OpsSignal, type SigStatus } from '@/mock/ops-signals';
import { SignalDetail, StatusTag, type DetailActions } from './parts/SignalDetail';

type Patch = Partial<Pick<OpsSignal, 'status' | 'owner'>> & { until?: string; sent?: string[] };
type Sort = 'severity' | 'newest' | 'impact';

export default function Page() {
  const { platforms, cities, query, scopeLabel } = useFilters();
  const d = useSignals();
  const [type, setType] = useState<string>('All');
  const [status, setStatus] = useState<string>('open');
  const [sev, setSev] = useState<string>('all');
  const [owner, setOwner] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('severity');
  const [sel, setSel] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [approvals, setApprovals] = useState<string[]>([]);
  const [bandsOpen, setBandsOpen] = useState(false);
  const [bands, setBands] = useState(SEVERITY_BANDS.map((b) => ({ ...b })));
  const [ruleOpen, setRuleOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [rulesAdded, setRulesAdded] = useState<string[]>([]);
  const [form] = Form.useForm();

  const capturedAt = d.meta?.captured_at ?? '';
  const all: OpsSignal[] = useMemo(() => {
    if (!capturedAt) return [];
    const real = enrichReal(d.signals);
    const sample = sampleSignals({ platforms, cities, capturedAt, anchors: anchorsOf(d.latest) });
    return [...real, ...sample].map((s) => ({ ...s, ...patches[s.id], status: patches[s.id]?.status ?? s.status, owner: patches[s.id]?.owner ?? s.owner }));
  }, [d.signals, d.latest, platforms, cities, capturedAt, patches]);

  const patch = (id: string, p: Patch) => setPatches((m) => ({ ...m, [id]: { ...m[id], ...p } }));

  const list = useMemo(() => {
    const rows = all.filter(
      (s) =>
        (type === 'All' || s.type === type) &&
        (status === 'all' ? true : status === 'open' ? !['Resolved', 'Dismissed', 'Snoozed'].includes(s.status) : s.status === status) &&
        (sev === 'all' || s.severity === sev) &&
        (owner === 'all' || s.owner === owner),
    );
    return rows.sort((a, b) => (sort === 'severity' ? SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.confidence - a.confidence : sort === 'newest' ? (a.detected_at < b.detected_at ? 1 : -1) : (b.impactInr ?? 0) - (a.impactInr ?? 0)));
  }, [all, type, status, sev, owner, sort]);

  if (d.isLoading) return (<><PageHead title="Signals & Insights" /><SkeletonBlock h={420} /></>);
  if (d.isError) return (<><PageHead title="Signals & Insights" /><ErrorState onRetry={() => d.refetch()} /></>);

  const open = all.filter((s) => !['Resolved', 'Dismissed', 'Snoozed'].includes(s.status));
  const bySev = (v: string) => open.filter((s) => s.severity === v).length;
  const newest = capturedAt ? Date.parse(capturedAt) - 86400_000 : 0;
  const newCount = open.filter((s) => Date.parse(s.detected_at) > newest).length;
  const waiting = approvals.length;
  const resolved = all.filter((s) => s.status === 'Resolved').length;
  const risk = open.reduce((a, s) => a + (s.impactInr ?? 0), 0);
  const typeCounts = (t: string) => all.filter((s) => (t === 'All' || s.type === t) && !['Resolved', 'Dismissed'].includes(s.status)).length;
  const current = all.find((s) => s.id === sel) ?? list[0];

  const acts = (s: OpsSignal): DetailActions => ({
    acknowledge: () => { patch(s.id, { status: 'Acknowledged' }); message.success(`Acknowledged · ${s.owner} owns it`); },
    assign: (o) => { patch(s.id, { owner: o, status: s.status === 'New' ? 'In progress' : s.status }); message.success(`Assigned to ${o}`); },
    snooze: (days) => { patch(s.id, { status: 'Snoozed', until: `${days}d` }); message.success(`Snoozed for ${days} day${days > 1 ? 's' : ''}`); },
    dismiss: () => { patch(s.id, { status: 'Dismissed' }); message.success('Signal dismissed'); },
    resolve: () => { patch(s.id, { status: 'Resolved' }); message.success('Marked resolved'); },
    sendForApproval: (a) => {
      setApprovals((x) => [...x, `${s.id}|${a}`]);
      patch(s.id, { status: s.status === 'New' || s.status === 'Acknowledged' ? 'In progress' : s.status, sent: [...(patches[s.id]?.sent ?? []), a] });
      message.success('Sent for approval — it now waits in the Inbox');
    },
  });

  const statusOptions = [{ value: 'open', label: 'Open' }, { value: 'all', label: 'Any status' }, ...(['New', 'Acknowledged', 'In progress', 'Snoozed', 'Resolved', 'Dismissed'] as SigStatus[]).map((v) => ({ value: v, label: v }))];

  return (
    <>
      <PageHead
        title="Signals & Insights"
        sub="Generated by workflows and rules from the latest data · reviewed and actioned by owners"
        actions={
          <>
            <Button onClick={() => setBandsOpen(true)}>Severity bands</Button>
            <Button onClick={() => setRuleOpen(true)}>New rule{rulesAdded.length ? ` (${rulesAdded.length})` : ''}</Button>
            <Button type="primary" onClick={() => setDigestOpen(true)}>Send digest</Button>
          </>
        }
      />

      <Tiles
        items={[
          { label: 'Open', value: open.length, icon: <AlertOutlined />, note: `${bySev('critical')} critical · ${bySev('high')} high · ${bySev('medium')} medium · ${bySev('low')} low` },
          { label: 'New since yesterday', value: newCount, icon: <ThunderboltOutlined />, note: 'detected in the last 24 h of captures' },
          { label: 'Waiting on a person', value: waiting + open.filter((s) => s.status === 'In progress' && !patches[s.id]?.sent?.length).length, icon: <UserOutlined />, note: <Link href={`/inbox${query}`}>open in the Inbox</Link> },
          { label: 'Resolved · 7 d', value: resolved, icon: <CheckCircleOutlined />, note: 'closed by an owner' },
          { label: 'Est. at risk · weekly', value: risk ? inrShort(risk) : '—', icon: <ClockCircleOutlined />, note: 'sample feeds only; shelf signals not priced' },
        ]}
      />

      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <Segmented
          value={type}
          onChange={(v) => setType(String(v))}
          options={['All', ...SIGNAL_TYPES].map((t) => ({ value: t, label: `${t} ${typeCounts(t)}` }))}
          aria-label="Signal type"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Select value={status} onChange={setStatus} options={statusOptions} style={{ width: 150 }} aria-label="Status" />
        <Select value={sev} onChange={setSev} style={{ width: 150 }} aria-label="Severity" options={[{ value: 'all', label: 'All severities' }, ...(['critical', 'high', 'medium', 'low'] as const).map((v) => ({ value: v, label: `${v[0].toUpperCase()}${v.slice(1)} (${bySev(v)})` }))]} />
        <Select value={owner} onChange={setOwner} style={{ width: 200 }} aria-label="Owner" options={[{ value: 'all', label: 'Any owner' }, ...OWNERS.map((o) => ({ value: o, label: o }))]} />
        <span style={{ flex: 1 }} />
        <Select value={sort} onChange={setSort} style={{ width: 160 }} aria-label="Sort" options={[{ value: 'severity', label: 'By severity' }, { value: 'newest', label: 'Newest first' }, { value: 'impact', label: 'By impact' }]} />
      </div>

      {all.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bento">
          <Card className="span-7" lift={false} footer={<><span>{list.length} of {all.length} signals · {scopeLabel}</span><span style={{ flex: 1 }} /><Prov>Shelf capture · rule-derived</Prov><Prov kind="sample">Search · Competitor · Forecast · Media sample</Prov></>}>
            {list.length === 0 ? (
              <EmptyState text="No signal matches these filters." />
            ) : (
              list.map((s) => (
                <div
                  key={s.id}
                  className="feed-item"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open signal ${s.title}`}
                  onClick={() => setSel(s.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(s.id); } }}
                  style={{ cursor: 'pointer', background: current?.id === s.id ? 'var(--raised)' : undefined, borderColor: current?.id === s.id ? 'var(--border)' : undefined }}
                >
                  <span className={`sev ${s.severity}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{s.title}</div>
                    <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                      <span>{s.type}</span>
                      <span>{platformLabel(s.platform)} · {s.city}</span>
                      <span>{fmtIST(s.detected_at)}</span>
                      <span>{s.owner}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <span style={{ display: 'flex', gap: 4 }}><SevTag v={s.severity} /><StatusTag v={s.status} /></span>
                    {s.real ? <Tag color="green" bordered={false} style={{ marginInlineEnd: 0 }}>Real</Tag> : <Tag color="gold" bordered={false} style={{ marginInlineEnd: 0 }}>Sample</Tag>}
                  </div>
                </div>
              ))
            )}
          </Card>
          <div className="span-5" style={{ position: 'sticky', top: 80, alignSelf: 'start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
            {current ? <SignalDetail s={current} acts={acts(current)} snaps={d.snapshots} iv={d.intervals} approvalSent={approvals} query={query} /> : <Card lift={false}><EmptyState text="Pick a signal on the left." /></Card>}
          </div>
        </div>
      )}

      <Modal title="Severity bands" open={bandsOpen} onCancel={() => setBandsOpen(false)} onOk={() => { setBandsOpen(false); message.success('Severity bands saved'); }} okText="Save bands" width={720}>
        <p className="muted">Edit how a rule match maps to a severity. Applies to newly generated signals.</p>
        <Table
          size="small"
          pagination={false}
          rowKey="sev"
          dataSource={bands}
          columns={[
            { title: 'Severity', dataIndex: 'sev', width: 110, render: (v) => <SevTag v={v} /> },
            { title: 'When a signal falls in this band', dataIndex: 'rule', render: (v: string, row) => <Input value={v} onChange={(e) => setBands((b) => b.map((x) => (x.sev === row.sev ? { ...x, rule: e.target.value } : x)))} aria-label={`Band rule ${row.sev}`} /> },
          ]}
        />
      </Modal>

      <Modal
        title="New rule"
        open={ruleOpen}
        onCancel={() => setRuleOpen(false)}
        okText="Create rule"
        onOk={() => form.validateFields().then((v: { name: string }) => { setRulesAdded((r) => [...r, v.name]); setRuleOpen(false); form.resetFields(); message.success(`Rule "${v.name}" created — it runs on the next capture`); })}
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'Availability', severity: 'medium', threshold: 2 }}>
          <Form.Item name="name" label="Rule name" rules={[{ required: true, message: 'Give the rule a name' }]}><Input placeholder="e.g. Out of stock for 3 captures" /></Form.Item>
          <Form.Item name="type" label="Signal type"><Select options={SIGNAL_TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="severity" label="Severity"><Select options={['critical', 'high', 'medium', 'low'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="threshold" label="Threshold"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Send digest" open={digestOpen} onCancel={() => setDigestOpen(false)} okText="Send now" onOk={() => { setDigestOpen(false); message.success(`Digest of ${open.length} open signals sent to #qc-commerce`); }}>
        <p>The digest carries {open.length} open signals ({bySev('critical')} critical, {resolved} resolved this week) for {scopeLabel}.</p>
        <p className="muted">Sent to the Slack channel and the owners listed on each signal.</p>
      </Modal>
    </>
  );
}
