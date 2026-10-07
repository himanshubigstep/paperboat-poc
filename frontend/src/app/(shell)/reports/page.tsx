'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Table, Tabs, Tag, Timeline, message } from 'antd';
import { Card, EstimateTag, PageHead, Prov } from '@/components/ui';
import { Gate, Tiles } from '@/components/pagekit/Gate';
import { downloadCsv } from '@/components/pagekit/csv';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { HISTORY, RECIPIENT_POOL, REPORTS, TEMPLATES, type ReportDef, type ReportKind } from '@/mock/data-reports';
import { buildReport, type PSection } from './build';

const KINDS: ('All' | ReportKind)[] = ['All', 'Scheduled', 'Real-time', 'AI generated'];
const statusColor = { Ready: 'success', Draft: 'default', Paused: 'warning' } as const;

export default function Page() {
  const d = useDataset();
  const { query, scopeLabel } = useFilters();
  const [reports, setReports] = useState<ReportDef[]>(REPORTS);
  const [sel, setSel] = useState('brief');
  const [kind, setKind] = useState<'All' | ReportKind>('All');
  const [q, setQ] = useState('');
  const [off, setOff] = useState<Record<string, string[]>>({});
  const [tplOpen, setTplOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTo, setShareTo] = useState('');
  const [newRec, setNewRec] = useState('');
  const [delivery, setDelivery] = useState<Record<string, { cadence: string; format: string; channels: string[] }>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFmt, setExportFmt] = useState<'CSV' | 'PDF'>('CSV');

  const report = reports.find((r) => r.id === sel) ?? reports[0];
  const patch = (id: string, p: Partial<ReportDef>) => setReports((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const ctx = useMemo(() => ({ latest: d.latest, snapshots: d.snapshots, intervals: d.intervals, capturesPerDay: d.meta?.captures_per_day ?? 3 }), [d.latest, d.snapshots, d.intervals, d.meta]);
  const baseId = report.id.startsWith('draft-') ? (TEMPLATES.find((t) => t.id === report.id.split(':')[1])?.base ?? 'brief') : report.id;
  const sections: PSection[] = useMemo(() => buildReport(baseId, ctx), [baseId, ctx]);
  const hidden = off[report.id] ?? [];
  const visible = sections.filter((s) => !hidden.includes(s.id));
  const dlv = delivery[report.id] ?? { cadence: report.cadence, format: report.format, channels: report.channels };

  const shown = reports.filter((r) => (kind === 'All' || r.kind === kind) && (!q || `${r.name} ${r.sub}`.toLowerCase().includes(q.toLowerCase())));
  const hasSample = visible.some((s) => s.sample);

  const doExport = () => {
    if (exportFmt === 'CSV') {
      downloadCsv(`${report.id}.csv`, visible.flatMap((s) => s.rows.map((r) => Object.fromEntries([['section', s.h], ...s.cols.map((c, i) => [c, r[i]] as [string, string | number])]))));
      message.success(`${report.name} exported as CSV`);
    } else message.success(`${report.name} exported as PDF`);
    setExportOpen(false);
  };

  return (
    <>
      <PageHead
        title="Reports Center"
        sub="Scheduled, real-time and AI-generated reports · preview, export, share and schedule"
        actions={<>
          <Button onClick={() => setTplOpen(true)}>Templates</Button>
          <Link href={`/assistant${query}`}><Button type="primary">New report with the Assistant</Button></Link>
        </>}
      />
      <Gate d={d}>
        <Tiles items={[
          { label: 'Reports', value: reports.length, note: `${reports.filter((r) => r.real).length} built on the capture` },
          { label: 'Scheduled', value: reports.filter((r) => r.kind === 'Scheduled' && r.status !== 'Paused').length, note: `${reports.filter((r) => r.status === 'Paused').length} paused` },
          { label: 'Real-time', value: reports.filter((r) => r.kind === 'Real-time').length, note: 'run after every capture' },
          { label: 'AI generated', value: reports.filter((r) => r.kind === 'AI generated').length, note: 'on demand' },
          { label: 'Drafts', value: reports.filter((r) => r.status === 'Draft').length, note: 'not yet sent' },
        ]} />
        <div className="bento">
          <Card className="span-4" lift={false} title="Reports" sub={scopeLabel} footer={<Prov kind="sample">Catalogue &amp; schedule are sample</Prov>}>
            <Input allowClear placeholder="Search reports" aria-label="Search reports" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
            <Tabs size="small" activeKey={kind} onChange={(k) => setKind(k as typeof kind)} items={KINDS.map((k) => ({ key: k, label: k }))} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 560, overflowY: 'auto' }}>
              {!shown.length && <div className="muted">No report matches.</div>}
              {shown.map((r) => (
                <button key={r.id} type="button" onClick={() => setSel(r.id)} aria-current={r.id === report.id} style={{ textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 12, border: `1px solid ${r.id === report.id ? 'var(--pb-violet)' : 'var(--border)'}`, background: r.id === report.id ? 'var(--raised)' : 'transparent', color: 'var(--ink)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b style={{ flex: 1 }}>{r.name}</b><Tag bordered={false} color={statusColor[r.status]} style={{ marginInlineEnd: 0 }}>{r.status}</Tag></div>
                  <div className="muted" style={{ fontSize: 12 }}>{r.sub}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.kind} · {r.cadence}</div>
                </button>
              ))}
            </div>
          </Card>
          <Card className="span-8" lift={false} title={report.name} sub={`${report.sub} · ${report.kind} · ${report.format}`}
            actions={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button size="small" onClick={() => setExportOpen(true)}>Export</Button>
              <Button size="small" onClick={() => setShareOpen(true)}>Share</Button>
              <Button size="small" type="primary" onClick={() => { message.success(`${report.name} sent to ${report.audience.length} recipient group(s)`); }}>Send now</Button>
            </div>}
            footer={<>{report.real ? <Prov>Shelf capture · {scopeLabel}</Prov> : <Prov kind="sample">Sample data</Prov>}{hasSample && report.real && <Prov kind="sample">Some sections are sample</Prov>}</>}>
            <Tabs items={[
              { key: 'preview', label: 'Preview', children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {!visible.length && <div className="muted">All sections are switched off. Turn some on in the Sections tab.</div>}
                  {visible.map((s) => (
                    <div key={s.id}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h3 style={{ margin: 0, fontSize: 16 }}>{s.h}</h3>{s.estimate && <EstimateTag />}{s.sample && <Prov kind="sample">Sample</Prov>}</div>
                      <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                      <Table size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} dataSource={s.rows.map((r, i) => ({ key: i, ...Object.fromEntries(s.cols.map((c, j) => [`c${j}`, r[j]])) }))} columns={s.cols.map((c, j) => ({ title: c, dataIndex: `c${j}`, align: typeof s.rows[0]?.[j] === 'number' ? ('right' as const) : undefined }))} />
                    </div>
                  ))}
                </div>
              ) },
              { key: 'sections', label: 'Sections', children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="muted">The preview follows these switches — the document on screen is the document that would be sent.</div>
                  {sections.map((s) => <Checkbox key={s.id} checked={!hidden.includes(s.id)} onChange={(e) => setOff((o) => ({ ...o, [report.id]: e.target.checked ? hidden.filter((x) => x !== s.id) : [...hidden, s.id] }))}>{s.h}</Checkbox>)}
                </div>
              ) },
              { key: 'delivery', label: 'Delivery', children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
                  <div><b>Recipients</b><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {report.audience.map((a) => <Tag key={a} closable onClose={() => patch(report.id, { audience: report.audience.filter((x) => x !== a) })}>{a}</Tag>)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Select showSearch allowClear style={{ flex: 1 }} placeholder="Add recipient" aria-label="Add recipient" value={newRec || undefined} onChange={(v) => setNewRec(v ?? '')} options={RECIPIENT_POOL.filter((x) => !report.audience.includes(x)).map((x) => ({ value: x, label: x }))} />
                    <Button disabled={!newRec} onClick={() => { patch(report.id, { audience: [...report.audience, newRec] }); message.success(`${newRec} added`); setNewRec(''); }}>Add recipient</Button>
                  </div></div>
                  <div><b>Schedule</b><Select style={{ width: '100%', marginTop: 6 }} aria-label="Schedule" value={dlv.cadence} onChange={(v) => setDelivery((x) => ({ ...x, [report.id]: { ...dlv, cadence: v } }))} options={['After every capture', 'Daily · 08:00', 'Weekly · Monday 07:30', 'Weekly · Friday 10:00', 'On demand', report.cadence].filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ value: v, label: v }))} /></div>
                  <div><b>Format</b><Select style={{ width: '100%', marginTop: 6 }} aria-label="Format" value={dlv.format} onChange={(v) => setDelivery((x) => ({ ...x, [report.id]: { ...dlv, format: v } }))} options={['PDF', 'CSV', 'XLSX'].map((v) => ({ value: v, label: v }))} /></div>
                  <div><b>Channels</b><div><Checkbox.Group value={dlv.channels} onChange={(v) => setDelivery((x) => ({ ...x, [report.id]: { ...dlv, channels: v as string[] } }))} options={['Email', 'Slack #leadership', 'Slack #sales', 'Slack #data', 'Inbox']} /></div></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button type="primary" onClick={() => { patch(report.id, { cadence: dlv.cadence, format: dlv.format as ReportDef['format'], channels: dlv.channels }); message.success('Delivery settings saved'); }}>Save delivery settings</Button>
                    <Button onClick={() => { const next = report.status === 'Paused' ? 'Ready' : 'Paused'; patch(report.id, { status: next }); message.success(next === 'Paused' ? 'Schedule paused' : 'Schedule resumed'); }}>{report.status === 'Paused' ? 'Resume schedule' : 'Pause schedule'}</Button>
                  </div>
                </div>
              ) },
              { key: 'history', label: 'What happened', children: (
                <div>
                  <Timeline items={HISTORY.map((h) => ({ children: <div><b>{h.what}</b><div className="muted" style={{ fontSize: 12 }}>{h.when} · {h.who}</div></div> }))} />
                  <Prov kind="sample">Sample delivery history</Prov>
                </div>
              ) },
            ]} />
          </Card>
        </div>
      </Gate>

      <Modal open={tplOpen} title="Start from a template" footer={null} onCancel={() => setTplOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TEMPLATES.map((t) => {
            const base = REPORTS.find((r) => r.id === t.base)!;
            return (
              <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: 'var(--raised)' }}>
                <div style={{ flex: 1 }}><b>{t.name}</b><div className="muted" style={{ fontSize: 12 }}>{t.kind} · based on {base.name}</div></div>
                <Button size="small" onClick={() => {
                  const id = `draft-${reports.length}:${t.id}`;
                  setReports((rs) => [{ ...base, id, name: t.name, kind: t.kind, status: 'Draft', last: 'Not yet sent' }, ...rs]);
                  setSel(id); setTplOpen(false); message.success('Draft created from a template');
                }}>Use</Button>
              </div>
            );
          })}
        </div>
      </Modal>
      <Modal open={shareOpen} title="Share report" okText="Share" onCancel={() => setShareOpen(false)} okButtonProps={{ disabled: !shareTo.trim() }} onOk={() => { setShareOpen(false); message.success(`${report.name} shared with ${shareTo}`); setShareTo(''); }}>
        <Input placeholder="Name or email" aria-label="Share with" value={shareTo} onChange={(e) => setShareTo(e.target.value)} />
      </Modal>
      <Modal open={exportOpen} title="Export report" okText="Download" onCancel={() => setExportOpen(false)} onOk={doExport}>
        <Select value={exportFmt} onChange={setExportFmt} aria-label="Format" style={{ width: 200 }} options={[{ value: 'CSV', label: 'CSV (all visible sections)' }, { value: 'PDF', label: 'PDF' }]} />
      </Modal>
    </>
  );
}
