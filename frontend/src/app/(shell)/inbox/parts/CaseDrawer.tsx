'use client';

import { Alert, Button, Descriptions, Drawer, Select, Steps, Tag } from 'antd';
import Link from 'next/link';
import { PlatformTag, CityTag, fmtINR, Prov } from '@/components/ui';
import { type OpsCase, FLOW, kindLabel, OWNERS_POOL, STATE_LABEL } from '@/mock/ops-cases';
import { fmtDate } from '@/mock/ops-common';

export interface DrawerActions {
  approveSubmit: () => void;
  reassign: (owner: string) => void;
  clear: () => void;
  evidence: () => void;
  chase: () => void;
  escalate: () => void;
}

export function CaseDrawer({ c, open, onClose, acts, query, today }: { c: OpsCase | null; open: boolean; onClose: () => void; acts: DrawerActions; query: string; today: string }) {
  if (!c) return <Drawer open={false} onClose={onClose} />;
  const decide = c.step === 0 || c.step === 1;
  const withPlatform = c.step >= 2 && c.step <= 3;
  const stale = c.guard === 'Stale';
  return (
    <Drawer open={open} onClose={onClose} width={520} title={<span>{c.id} · {kindLabel(c.kind)}</span>} destroyOnClose
      footer={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {decide && <Button type="primary" disabled={stale} onClick={acts.approveSubmit}>Approve &amp; submit</Button>}
          {decide && <Button onClick={acts.clear}>Clear</Button>}
          <Button onClick={acts.evidence}>Evidence</Button>
          {withPlatform && <Button onClick={acts.chase}>Chase</Button>}
          {withPlatform && <Button danger onClick={acts.escalate}>Escalate</Button>}
          <Link href={`/value${query}${query ? '&' : '?'}case=${c.id}`}><Button type="link">Open the case</Button></Link>
        </div>
      }>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <Tag color={c.step < 0 ? 'red' : c.step >= 4 ? 'green' : 'purple'} bordered={false}>{STATE_LABEL(c.step)}</Tag>
        <Tag color={c.priority === 'P1' ? 'red' : c.priority === 'P2' ? 'orange' : 'default'} bordered={false}>{c.priority}</Tag>
        <PlatformTag id={c.platform} />
        <CityTag city={c.city.split(' + ')[0]} />
        {c.real ? <Prov>Trigger from shelf capture</Prov> : <Prov kind="sample">Sample data</Prov>}
      </div>
      <h3 style={{ margin: '4px 0 6px' }}>{c.title}</h3>
      <p className="sec">{c.observed}</p>
      {stale && <Alert type="warning" showIcon style={{ marginBottom: 12, borderRadius: 12 }} message="Guard stale" description="The evidence is older than 14 days. Re-read the shelf before approving." />}

      <Steps size="small" direction="vertical" current={c.step < 0 ? 0 : c.step} status={c.step < 0 ? 'error' : 'process'}
        items={(c.step < 0 ? [...FLOW.slice(0, 1).map((f) => f.label), 'Rejected'] : FLOW.map((f) => f.label)).map((label, i) => {
          const key = c.step < 0 ? (i === 0 ? 'prepared' : 'rejected') : FLOW[i].key;
          const h = c.history.find((x) => x.step === key);
          return { title: label, description: h ? `${fmtDate(h.at)} · ${h.by}` : i === c.step + 1 ? 'next' : '' };
        })} />

      <Descriptions column={1} size="small" bordered style={{ margin: '16px 0' }}
        items={[
          { key: 'type', label: 'Decision type', children: kindLabel(c.kind) },
          { key: 'prep', label: 'Prepared by', children: c.preparedBy },
          { key: 'appr', label: 'Approved by', children: c.step >= 1 ? `${c.approvedBy} · ${fmtDate(c.history.find((h) => h.step === 'approved')?.at)}` : `${c.approvedBy} (pending)` },
          { key: 'owner', label: 'Owner', children: c.owner },
          { key: 'route', label: 'Route', children: `${c.route.mode} → ${c.route.endpoint}` },
          { key: 'lim', label: 'Approved limits', children: c.limits },
          { key: 'due', label: 'Due', children: `${fmtDate(c.dueAt)}${c.dueAt < today && c.step >= 0 && c.step <= 3 ? ' · overdue' : ''}` },
          { key: 'claim', label: 'Value claimed', children: `${fmtINR(c.outcome.claimedInr)} (sample basis)` },
          { key: 'ref', label: 'Platform reference', children: c.route.ref ?? 'Not returned yet' },
          { key: 'rb', label: 'Reads back', children: `${c.readback.field} · ${c.readback.before} ${c.readback.unit} at capture` },
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
      {decide && (
        <div style={{ marginTop: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Reassign</div>
          <Select value={c.owner} style={{ width: '100%' }} onChange={acts.reassign} aria-label="Reassign owner"
            options={Array.from(new Set([c.owner, ...OWNERS_POOL])).map((o) => ({ value: o, label: o }))} />
        </div>
      )}
    </Drawer>
  );
}
