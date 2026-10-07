'use client';

import { Alert, Button, Descriptions, Drawer, Popconfirm, Steps, Tag } from 'antd';
import Link from 'next/link';
import { CityTag, PlatformTag, Prov, fmtINR } from '@/components/ui';
import { type OpsCase, FLOW, kindLabel, nextActionLabel, STATE_LABEL } from '@/mock/ops-cases';
import { fmtDate } from '@/mock/ops-common';

function explain(c: OpsCase): string {
  if (c.step < 0) return `${c.id} was rejected at approval. Re-opening sends it back for a decision.`;
  if (c.closed) return `${c.id} is closed. The verified figure stays in the ledger.`;
  if (c.step >= 5) return `${c.id} would be closed. The verified figure stays in the verified ledger; nothing moves to it later.`;
  if (c.step === 4) return `${c.id} would be measured over 14 days against the baseline of ${c.outcome.baseline} ${c.readback.unit}.`;
  if (c.step >= 2) return `The next read of ${c.readback.field} would be compared with ${c.readback.before} ${c.readback.unit}. Until then ${c.id} claims nothing.`;
  if (c.step === 1) return `${c.id} would be submitted via ${c.route.mode.toLowerCase()} to ${c.route.endpoint}, within the approved limits.`;
  return c.sent ? `${c.id} is waiting in the Inbox for ${c.approvedBy}.` : `${c.id} would be sent to ${c.approvedBy} in the Inbox.`;
}

export function ValueDrawer({ c, open, onClose, onNext, onReject, onEvidence, query }: { c: OpsCase | null; open: boolean; onClose: () => void; onNext: () => void; onReject: () => void; onEvidence: () => void; query: string }) {
  if (!c) return <Drawer open={false} onClose={onClose} />;
  const label = nextActionLabel(c);
  const disabled = (c.step === 0 && c.sent) || c.closed;
  const o = c.outcome;
  return (
    <Drawer open={open} onClose={onClose} width={540} destroyOnClose title={`${c.id} · ${kindLabel(c.kind)}`}
      footer={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Popconfirm title={label} description={explain(c)} okText="Confirm" onConfirm={onNext} disabled={disabled}>
            <Button type="primary" disabled={disabled}>{label}</Button>
          </Popconfirm>
          {c.step >= 0 && c.step <= 1 && <Button danger onClick={onReject}>Reject</Button>}
          <Button onClick={onEvidence}>Evidence</Button>
          {c.step === 0 && c.sent && <Link href={`/inbox${query}`}><Button type="link">Open the Inbox</Button></Link>}
        </div>
      }>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <Tag color={c.step < 0 ? 'red' : c.step >= 4 ? 'green' : 'purple'} bordered={false}>{STATE_LABEL(c.step)}{c.closed ? ' · closed' : ''}</Tag>
        <Tag bordered={false}>{c.priority}</Tag>
        <PlatformTag id={c.platform} />
        <CityTag city={c.city.split(' + ')[0]} />
        {c.real ? <Prov>Trigger from shelf capture</Prov> : <Prov kind="sample">Sample data</Prov>}
      </div>
      <h3 style={{ margin: '4px 0 6px' }}>{c.title}</h3>
      <p className="sec">{c.observed}</p>
      {c.guard === 'Stale' && <Alert type="warning" showIcon style={{ marginBottom: 12, borderRadius: 12 }} message="Evidence is stale — re-read the shelf before acting." />}
      <Steps size="small" direction="vertical" current={c.step < 0 ? 0 : c.step} status={c.step < 0 ? 'error' : 'process'}
        items={(c.step < 0 ? ['Prepared', 'Rejected'] : FLOW.map((f) => f.label)).map((l, i) => {
          const key = c.step < 0 ? (i === 0 ? 'prepared' : 'rejected') : FLOW[i].key;
          const h = c.history.find((x) => x.step === key);
          return { title: l, description: h ? `${fmtDate(h.at)} · ${h.by}` : i === c.step + 1 ? 'next' : '' };
        })} />
      <Descriptions column={1} size="small" bordered style={{ margin: '16px 0' }}
        items={[
          { key: 'owner', label: 'Owner', children: c.owner },
          { key: 'due', label: 'Due', children: fmtDate(c.dueAt) },
          { key: 'route', label: 'Route', children: `${c.route.mode} → ${c.route.endpoint}` },
          { key: 'ref', label: 'Platform reference', children: c.route.ref ?? '—' },
          { key: 'rb', label: 'Readback', children: c.readback.after !== null ? `${c.readback.field}: ${c.readback.before} → ${c.readback.after} ${c.readback.unit} (${fmtDate(c.readback.verifiedAt)})` : `${c.readback.field}: ${c.readback.before} ${c.readback.unit} at capture · not read back` },
          { key: 'claim', label: 'Claimed', children: fmtINR(o.claimedInr) },
          { key: 'ver', label: 'Verified', children: c.step >= 5 ? `${fmtINR(o.verifiedInr)} (${Math.round((o.verifiedInr / Math.max(1, o.claimedInr) - 1) * 100)}% vs claim)` : '—' },
          { key: 'cost', label: 'Cost of the work', children: fmtINR(o.costInr) },
          { key: 'basis', label: 'Basis', children: <span className="muted">{o.basis}</span> },
        ]} />
      <h4>Evidence</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {c.evidence.map((e) => (
          <div key={e.label} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' }}>
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{e.value}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{e.label}</div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
