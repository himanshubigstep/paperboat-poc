'use client';

import { Alert, Button, Modal, Select, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, PlayCircleOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ColumnChart, LineChart } from '@/components/charts';
import { Tiles } from '@/components/ops/Tiles';
import { Card, EmptyState, ErrorState, fmtIST, PageHead, Prov, SkeletonBlock, UrlTabs } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { istHour } from '@/lib/metrics';
import { addH } from '@/mock/ops-common';
import { buildRuns, occurrences, type Run, type RunStatus, WF_CAPTURE, WORKFLOWS } from '@/mock/ops-workflows';
import { dur, RunDrawer, STATUS_COLOR } from './parts/RunDrawer';

const STATUSES: RunStatus[] = ['Success', 'Failed', 'Running', 'Waiting approval', 'Partial'];

export default function Page() {
  const { platforms, cities, query } = useFilters();
  const d = useDataset();
  const [wfSel, setWfSel] = useState('all');
  const [out, setOut] = useState('all');
  const [trig, setTrig] = useState('all');
  const [hours, setHours] = useState(24 * 7);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fix, setFix] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Run[]>([]);
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(WORKFLOWS.map((w) => [w.id, true])));
  const [paused, setPaused] = useState(false);
  const [mapRun, setMapRun] = useState<string | null>(null);
  const [mapCol, setMapCol] = useState('avg_offer_price_inr');
  const [durWf, setDurWf] = useState(WF_CAPTURE);

  const capturedAt = d.meta?.captured_at ?? '';
  const base = useMemo(() => buildRuns({ snapshots: d.snapshots, captures: d.captures, platforms, cities, capturedAt }), [d.snapshots, d.captures, platforms, cities, capturedAt]);
  const runs: Run[] = useMemo(() => [...extra, ...base].map((r) => (fix[r.id] ? { ...r, status: 'Success' as RunStatus, failedNodes: 0, error: undefined, stepTimes: r.stepTimes.map((s) => ({ ...s, ok: true })) } : r)), [base, extra, fix]);

  if (d.isLoading) return (<><PageHead title="Workflow Monitoring" /><SkeletonBlock h={420} /></>);
  if (d.isError) return (<><PageHead title="Workflow Monitoring" /><ErrorState onRetry={() => d.refetch()} /></>);

  const nowMs = Date.parse(capturedAt);
  const last24 = runs.filter((r) => Date.parse(r.started) > nowMs - 86400_000);
  const stopped = runs.filter((r) => r.error && (r.status === 'Failed' || r.status === 'Waiting approval'));
  const failed = runs.filter((r) => r.status === 'Failed');
  const waiting = runs.filter((r) => r.status === 'Waiting approval');
  const wfName = (id: string) => WORKFLOWS.find((w) => w.id === id)?.name ?? id;
  const nextRun = (id: string) => { const w = WORKFLOWS.find((x) => x.id === id)!; return occurrences(w.sched, addH(capturedAt, 0.001), addH(capturedAt, 24 * 8))[0]; };

  const filtered = runs.filter((r) => (wfSel === 'all' || r.wf === wfSel) && (out === 'all' || r.status === out) && (trig === 'all' || r.trigger === trig) && Date.parse(r.started) > nowMs - hours * 3600_000);
  const hourly = last24.reduce<Record<string, number>>((m, r) => { const k = `${String(istHour(r.started)).padStart(2, '0')}:00|${r.status}`; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const hourData = Object.entries(hourly).map(([k, runsN]) => { const [hour, status] = k.split('|'); return { hour, status, runs: runsN }; }).sort((a, b) => (a.hour < b.hour ? -1 : 1));
  const durData = runs.filter((r) => r.wf === durWf).slice(0, 20).reverse().map((r, i) => ({ run: `${i + 1}`, seconds: r.durationS, scope: r.scope ?? 'All' }));
  const success = last24.length ? Math.round((last24.filter((r) => r.status === 'Success').length / last24.length) * 1000) / 10 : 0;

  const againOf = (r: Run) => {
    const nr: Run = { ...r, id: `run-${9000 + runs.length + extra.length + 1}`, trigger: 'Manual', started: capturedAt, status: 'Success', error: undefined, failedNodes: 0, stepTimes: r.stepTimes.map((s) => ({ ...s, ok: true })) };
    setExtra((e) => [nr, ...e]);
    message.success(`${r.workflow} started again as ${nr.id}`);
  };
  const exportSummary = (list: Run[]) => {
    const rows = [['Run', 'Workflow', 'Started (IST)', 'Took s', 'Status', 'Trigger', 'Signals', 'Source'], ...list.map((r) => [r.id, r.workflow, fmtIST(r.started), String(r.durationS), r.status, r.trigger, String(r.signals), r.real ? 'dataset' : 'sample'])];
    const blob = new Blob([rows.map((x) => x.map((c) => `"${c}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'workflow-runs.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    message.success(`Exported ${list.length} runs`);
  };

  const cur = runs.find((r) => r.id === openId) ?? null;
  const runCols: ColumnsType<Run> = [
    { title: 'Run', dataIndex: 'id', render: (v: string, r) => <span><code>{v}</code> {r.real && <Tag color="green" bordered={false}>Real</Tag>}</span> },
    { title: 'Workflow', key: 'w', render: (_, r) => <div>{r.workflow}{r.scope && <div className="muted" style={{ fontSize: 12 }}>{r.scope} · {r.rows} rows</div>}</div> },
    { title: 'Started', key: 's', render: (_, r) => <span className="tnum">{fmtIST(r.started)}</span> },
    { title: 'Took', key: 't', align: 'right', render: (_, r) => <span className="tnum">{dur(r.durationS)}</span> },
    { title: 'Trigger', dataIndex: 'trigger' },
    { title: 'Outcome', key: 'o', render: (_, r) => <Tag color={STATUS_COLOR[r.status]} bordered={false}>{r.status}</Tag> },
  ];

  const stopCols: ColumnsType<Run> = [
    { title: 'Run', dataIndex: 'id', render: (v: string) => <code>{v}</code> },
    { title: 'Workflow', dataIndex: 'workflow' },
    { title: 'Stopped at', key: 'a', render: (_, r) => r.error?.stoppedAt },
    { title: 'What went wrong', key: 'm', width: 380, render: (_, r) => <span className="sec">{r.error?.message}</span> },
    { title: 'When', key: 'w', render: (_, r) => <span className="muted tnum">{fmtIST(r.started)}</span> },
    { title: '', key: 'x', render: (_, r) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        {r.error?.fix === 'retry' && <Button size="small" onClick={() => { setFix((f) => ({ ...f, [r.id]: 'retry' })); message.success(`${r.id} retried — succeeded`); }}>Retry</Button>}
        {r.error?.fix === 'gap' && <><Button size="small" onClick={() => { setFix((f) => ({ ...f, [r.id]: 'gap' })); message.success(`${r.id}: gap accepted and noted in the freshness log`); }}>Accept gap</Button>{' '}<Button size="small" type="text" onClick={() => { setFix((f) => ({ ...f, [r.id]: 'retry' })); message.success(`${r.id} retried — succeeded`); }}>Retry</Button></>}
        {r.error?.fix === 'mapping' && <Button size="small" onClick={() => setMapRun(r.id)}>Fix mapping</Button>}
        {r.error?.fix === 'approval' && <Link href={`/inbox${query}`}><Button size="small" type="primary">Open in Inbox</Button></Link>}{' '}
        <Button size="small" type="text" onClick={() => message.warning(`${r.id} escalated to the workflow owner`)}>Escalate</Button>
      </span>) },
  ];

  // ---- real-ish monitoring rules computed from the dataset
  const capSlots = d.captures.length;
  const lastCap = d.captures[d.captures.length - 1];
  const lastRows = d.snapshots.filter((s) => s.capture_id === lastCap);
  const expectedRows = d.latest.length;
  const completeness = expectedRows ? Math.round((lastRows.length / expectedRows) * 1000) / 10 : 0;
  const lateDays = new Set(d.snapshots.filter((s) => istHour(s.scraped_at) >= 7 && istHour(s.scraped_at) < 11).map((s) => s.scraped_at.slice(0, 10))).size;
  const rules = [
    { rule: 'A person has not answered within 8 hours', note: waiting[0] ? `${waiting[0].id} · Supply planner · stock move` : 'No decision is waiting', status: waiting.length ? 'Breached' : 'Healthy', since: waiting[0]?.started, real: false, to: `/inbox${query}` },
    { rule: 'Shelf capture completes on at least 98% of listings', note: `Latest capture ${lastCap ?? '—'}: ${lastRows.length} of ${expectedRows} listings (${completeness}%)`, status: completeness >= 98 ? 'Healthy' : 'Breached', since: undefined, real: true },
    { rule: 'Three captures a day, every day', note: `${capSlots} captures in the last ${d.captures.length ? Math.ceil(capSlots / 3) : 0} days of scope`, status: 'Healthy', since: undefined, real: true },
    { rule: 'Morning capture lands before 07:00 IST', note: lateDays ? `${lateDays} day(s) with listings scraped after 07:00 IST` : 'Every morning capture finished before 07:00 IST', status: lateDays ? 'Watch' : 'Healthy', since: undefined, real: true },
  ];

  const wfCols: ColumnsType<(typeof WORKFLOWS)[number]> = [
    { title: 'Workflow', key: 'n', render: (_, w) => <div><b>{w.name}</b><div className="muted" style={{ fontSize: 12 }}>{w.id} · {w.version}</div></div> },
    { title: 'Schedule', dataIndex: 'scheduleLabel' },
    { title: 'Autonomy', dataIndex: 'autonomy', render: (v: string) => <Tag bordered={false}>{v}</Tag> },
    { title: 'Success · 7 d', key: 'sr', align: 'right', render: (_, w) => { const rs = runs.filter((r) => r.wf === w.id); return rs.length ? `${Math.round((rs.filter((r) => r.status === 'Success').length / rs.length) * 1000) / 10}%` : '—'; } },
    { title: 'Runs · 7 d', key: 'r7', align: 'right', render: (_, w) => runs.filter((r) => r.wf === w.id).length },
    { title: 'Signals · 30 d', dataIndex: 'signals30d', align: 'right' },
    { title: 'Source', key: 'src', render: (_, w) => <Tag color={w.real ? 'green' : 'gold'} bordered={false}>{w.real ? 'Real runs' : 'Sample'}</Tag> },
    { title: 'Published', key: 'on', render: (_, w) => <Switch checked={on[w.id]} aria-label={`Toggle ${w.name}`} onChange={(v) => { setOn((o) => ({ ...o, [w.id]: v })); message.success(`${w.name} ${v ? 'turned on' : 'turned off — it stops raising signals and tasks'}`); }} /> },
  ];

  const runsTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="bento">
        <Card className="span-8" title="Runs by hour" sub="Last 24 hours, by outcome (IST)" footer={<><Prov>Shelf capture runs</Prov><Prov kind="sample">Other workflows sample</Prov></>}>
          {hourData.length ? <ColumnChart data={hourData} x="hour" y="runs" color="status" stack height={230} /> : <EmptyState text="No runs in the last 24 hours." />}
        </Card>
        <Card className="span-4" title="Run time" sub="Last 20 runs, seconds" actions={<Select size="small" value={durWf} onChange={setDurWf} style={{ width: 150 }} aria-label="Workflow for run time" options={WORKFLOWS.map((w) => ({ value: w.id, label: w.name }))} />} footer={durWf === WF_CAPTURE ? <Prov>last − first scraped_at</Prov> : <Prov kind="sample">Sample data</Prov>}>
          {durData.length ? <LineChart data={durData} x="run" y="seconds" height={230} /> : <EmptyState />}
        </Card>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Select value={wfSel} onChange={setWfSel} style={{ width: 260 }} aria-label="Workflow" options={[{ value: 'all', label: 'All workflows' }, ...WORKFLOWS.map((w) => ({ value: w.id, label: w.name }))]} />
        <Select value={out} onChange={setOut} style={{ width: 170 }} aria-label="Outcome" options={[{ value: 'all', label: 'Any outcome' }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
        <Select value={trig} onChange={setTrig} style={{ width: 150 }} aria-label="Trigger" options={[{ value: 'all', label: 'Any trigger' }, { value: 'Schedule', label: 'Schedule' }, { value: 'Manual', label: 'Manual' }]} />
        <Select value={hours} onChange={setHours} style={{ width: 150 }} aria-label="Range" options={[{ value: 24, label: 'Last 24 hours' }, { value: 72, label: 'Last 3 days' }, { value: 24 * 7, label: 'Last 7 days' }]} />
        <span style={{ flex: 1 }} />
        <Button onClick={() => exportSummary(filtered)}>Export summary</Button>
      </div>
      <Card lift={false} footer={<span>{filtered.length} runs · click a run for steps and timings</span>}>
        <Table<Run> rowKey="id" size="middle" columns={runCols} dataSource={filtered} scroll={{ x: 760 }} pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyState text="No run matches. Widen the workflow, outcome or range filter." /> }} onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })} />
      </Card>
    </div>
  );

  const wfTab = (
    <Card title="Published workflows" sub="Turn one off and it stops raising signals and tasks; nothing else changes" lift={false} footer={<Prov kind="sample">Counts sample · capture workflow from dataset</Prov>}>
      <Table size="middle" rowKey="id" columns={wfCols} dataSource={WORKFLOWS} pagination={false} scroll={{ x: 900 }} />
    </Card>
  );

  const schedTab = (
    <div className="bento">
      <Card className="span-7" title="Coming up" sub="Next scheduled run for each workflow · Asia/Kolkata" footer={<Prov kind="sample">Schedules sample · capture slots real</Prov>}>
        <Table size="small" rowKey="id" pagination={false} dataSource={WORKFLOWS} columns={[
          { title: 'Workflow', dataIndex: 'name' },
          { title: 'Schedule', dataIndex: 'scheduleLabel' },
          { title: 'Next run', key: 'n', render: (_, w) => (paused || !on[w.id] ? <Tag bordered={false}>{paused ? 'Paused' : 'Off'}</Tag> : <span className="tnum">{nextRun(w.id) ? fmtIST(nextRun(w.id)) : '—'}</span>) },
        ]} />
      </Card>
      <Card className="span-5" title="Schedule health" footer={<Prov kind="sample">Sample data</Prov>}>
        <Table size="small" showHeader={false} pagination={false} rowKey="k" dataSource={[
          { k: 'Scheduler', v: paused ? <Tag color="orange" bordered={false}>Paused by you</Tag> : <Tag color="green" bordered={false}>Running</Tag> },
          { k: 'Runs missed · 7 days', v: '0' },
          { k: 'Started late by more than 5 minutes · 7 days', v: '1' },
          { k: 'Waiting in the queue now', v: '0' },
          { k: 'Running at the same time', v: `${runs.filter((r) => r.status === 'Running').length} of 8 allowed` },
        ]} columns={[{ dataIndex: 'k' }, { dataIndex: 'v', align: 'right' }]} />
      </Card>
    </div>
  );

  const attTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Runs that stopped" sub="Nothing downstream ran, so no signal, task or action was created" lift={false} footer={<Prov kind="sample">Sample data</Prov>}>
        <Table<Run> rowKey="id" size="small" columns={stopCols} dataSource={stopped} scroll={{ x: 980 }} pagination={false} locale={{ emptyText: <EmptyState text="Nothing has stopped." /> }} />
      </Card>
      <Card title="Monitoring rules" sub="What we watch about the automations themselves" lift={false} footer={<><Prov>Capture rules from dataset</Prov><Prov kind="sample">Approval rule sample</Prov></>}>
        <Table size="small" rowKey="rule" pagination={false} dataSource={rules} columns={[
          { title: 'Rule', key: 'r', render: (_, r) => <div><b>{r.rule}</b><div className="muted" style={{ fontSize: 12 }}>{r.note}</div></div> },
          { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={v === 'Breached' ? 'red' : v === 'Watch' ? 'orange' : 'green'} bordered={false}>{v}</Tag> },
          { title: 'Since', key: 's', render: (_, r) => (r.since ? <span className="muted">{fmtIST(r.since)}</span> : '—') },
          { title: '', key: 'a', render: (_, r) => (r.to ? <Link href={r.to}><Button size="small">Open</Button></Link> : <Button size="small" type="text" onClick={() => message.info('History opened')}>History</Button>) },
        ]} />
      </Card>
    </div>
  );

  return (
    <>
      <PageHead
        title="Workflow Monitoring"
        sub="What the automations did, what they produced, and what needs a person"
        actions={
          <>
            <Link href={`/inbox${query}`}><Button>Inbox · {waiting.length} waiting</Button></Link>
            <Button danger={!paused} onClick={() => { setPaused((p) => !p); message.success(paused ? 'Schedules resumed' : 'All schedules paused'); }}>{paused ? 'Resume schedules' : 'Pause all schedules'}</Button>
          </>
        }
      />
      {paused && <Alert type="warning" showIcon style={{ marginBottom: 16, borderRadius: 14 }} message="All schedules are paused. No new runs will start until you resume." />}
      <Tiles
        items={[
          { label: 'Runs · 24 h', value: last24.length, icon: <PlayCircleOutlined />, note: `${last24.filter((r) => r.real).length} shelf captures` },
          { label: 'Success rate', value: `${success}%`, icon: <CheckCircleOutlined />, tone: success < 95 ? 'warn' : 'good', note: 'last 24 hours' },
          { label: 'Running now', value: runs.filter((r) => r.status === 'Running').length, icon: <ClockCircleOutlined />, note: 'in progress' },
          { label: 'Waiting on a person', value: waiting.length, icon: <UserOutlined />, tone: waiting.length ? 'warn' : undefined, note: 'approval pending' },
          { label: 'Failed', value: failed.length, icon: <CloseCircleOutlined />, tone: failed.length ? 'bad' : undefined, note: 'last 7 days' },
          { label: 'Signals raised', value: last24.reduce((a, r) => a + r.signals, 0), icon: <ThunderboltOutlined />, note: 'last 24 hours' },
        ]}
      />
      {runs.length === 0 ? <EmptyState text="No runs for these filters." /> : (
        <UrlTabs
          items={[
            { key: 'runs', label: 'Runs', children: runsTab },
            { key: 'workflows', label: `Workflows ${WORKFLOWS.length}`, children: wfTab },
            { key: 'schedule', label: 'Schedule', children: schedTab },
            { key: 'attention', label: `Needs attention ${stopped.length}`, children: attTab },
          ]}
        />
      )}
      <RunDrawer run={cur} open={!!cur && !!openId} onClose={() => setOpenId(null)} onAgain={() => cur && againOf(cur)} onExport={() => cur && exportSummary([cur])} />
      <Modal title="Fix mapping" open={!!mapRun} onCancel={() => setMapRun(null)} okText="Save and retry" onOk={() => { if (mapRun) { setFix((f) => ({ ...f, [mapRun]: 'mapping' })); message.success(`Mapped avg_offer_price to ${mapCol} — ${mapRun} retried and succeeded`); } setMapRun(null); }}>
        <p>The workflow expects <code>avg_offer_price</code>. Pick the column that replaces it in the benchmark dataset.</p>
        <Select value={mapCol} onChange={setMapCol} style={{ width: '100%' }} aria-label="Replacement column" options={['avg_offer_price_inr', 'median_offer_price', 'offer_price_mean'].map((c) => ({ value: c, label: c }))} />
      </Modal>
    </>
  );
}
