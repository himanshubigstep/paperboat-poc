'use client';

import { Button, Dropdown, Popconfirm, Select, Tag, Timeline } from 'antd';
import { CheckOutlined, DeleteOutlined, FieldTimeOutlined, MessageOutlined, SendOutlined, UserSwitchOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useMemo } from 'react';
import { Card, EstimateTag, fmtIST, fmtINR, Prov, SevTag } from '@/components/ui';
import { ColumnChart, LineChart } from '@/components/charts';
import { dailySellout } from '@/lib/metrics';
import { platformLabel } from '@/lib/config';
import type { SelloutInterval, Snapshot } from '@/lib/types';
import { productLabel } from '@/mock/ops-common';
import { OWNERS, type OpsSignal, type SigStatus } from '@/mock/ops-signals';

const STATUS_COLOR: Record<SigStatus, string> = { New: 'purple', Acknowledged: 'blue', 'In progress': 'orange', Snoozed: 'default', Resolved: 'green', Dismissed: 'default' };
export const StatusTag = ({ v }: { v: SigStatus }) => <Tag color={STATUS_COLOR[v]} bordered={false}>{v}</Tag>;
const HYP = { yes: ['✓', 'Supported', 'var(--pb-mint)'], no: ['✕', 'Ruled out', 'var(--pb-coral)'], unk: ['?', 'Unconfirmed', 'var(--ink-3)'] } as const;

export interface DetailActions {
  acknowledge: () => void;
  assign: (owner: string) => void;
  snooze: (days: number) => void;
  dismiss: () => void;
  sendForApproval: (action: string) => void;
  resolve: () => void;
}

/** Evidence chart for a REAL signal, rebuilt from the capture rows behind it. */
function RealEvidence({ s, snaps, iv }: { s: OpsSignal; snaps: Snapshot[]; iv: SelloutInterval[] }) {
  const data = useMemo(() => {
    const cities = s.city.split(' + ');
    if (s.metric.startsWith('Est. units')) {
      const rows = dailySellout(iv.filter((r) => r.platform === s.platform && cities.includes(r.city)), (r) => r.city);
      return { kind: 'units' as const, rows: rows.map((r) => ({ x: r.date.slice(5), y: r.units, s: r.series })) };
    }
    if (!s.product) return null;
    const rows = snaps.filter((x) => x.platform === s.platform && cities.includes(x.city) && productLabel(x) === s.product && x.availability !== 'not_listed');
    const byCap = new Map<string, { x: string; y: number; s: string; n: number }>();
    const useStock = s.type === 'Availability' || s.type === 'Inventory & expiry';
    rows.forEach((x) => {
      const k = `${x.capture_id}|${x.city}`;
      const v = useStock ? x.stock : x.selling_price ?? 0;
      const cur = byCap.get(k) ?? { x: x.capture_id.slice(5), y: 0, s: x.city, n: 0 };
      cur.y += v;
      cur.n += 1;
      byCap.set(k, cur);
    });
    const out = Array.from(byCap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => ({ x: v.x, y: Math.round((v.y / v.n) * 10) / 10, s: v.s }));
    return out.length ? { kind: useStock ? ('stock' as const) : ('price' as const), rows: out } : null;
  }, [s, snaps, iv]);
  if (!data) return null;
  const title = data.kind === 'units' ? 'Estimated units per day' : data.kind === 'stock' ? 'Stock per capture' : 'Selling price per capture (₹)';
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{title} {data.kind === 'units' && <EstimateTag />}</div>
      {data.kind === 'units' ? <ColumnChart data={data.rows} x="x" y="y" color="s" height={180} /> : <LineChart data={data.rows} x="x" y="y" color="s" height={180} />}
    </div>
  );
}

export function SignalDetail({ s, acts, snaps, iv, approvalSent, query }: { s: OpsSignal; acts: DetailActions; snaps: Snapshot[]; iv: SelloutInterval[]; approvalSent: string[]; query: string }) {
  const closed = s.status === 'Resolved' || s.status === 'Dismissed';
  const sample = s.chart && s.chart.length > 0;
  return (
    <Card
      className="signal-detail"
      lift={false}
      footer={s.real ? <Prov>Shelf capture · rule-derived</Prov> : <Prov kind="sample">Sample data</Prov>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <SevTag v={s.severity} />
        <Tag bordered={false}>{s.type}</Tag>
        <StatusTag v={s.status} />
        <span className="grow" style={{ flex: 1 }} />
        <span className="muted tnum" style={{ fontSize: 12 }}>{s.id}</span>
      </div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>{s.title}</h2>
      <div className="muted" style={{ fontSize: 12.5 }}>
        {platformLabel(s.platform)} · {s.city} · owner {s.owner} · detected {fmtIST(s.detected_at)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
        <Button type="primary" icon={<CheckOutlined />} disabled={closed || s.status === 'Acknowledged'} onClick={acts.acknowledge}>Acknowledge</Button>
        <Dropdown
          trigger={['click']}
          menu={{ items: OWNERS.map((o) => ({ key: o, label: o })), onClick: ({ key }) => acts.assign(key), selectedKeys: [s.owner] }}
        >
          <Button icon={<UserSwitchOutlined />} disabled={closed}>Assign</Button>
        </Dropdown>
        <Dropdown
          trigger={['click']}
          menu={{ items: [{ key: '1', label: '1 day' }, { key: '7', label: '7 days' }, { key: '30', label: '30 days' }], onClick: ({ key }) => acts.snooze(Number(key)) }}
        >
          <Button icon={<FieldTimeOutlined />} disabled={closed}>Snooze</Button>
        </Dropdown>
        <Link href={`/assistant${query}${query ? '&' : '?'}q=${encodeURIComponent(`Explain: ${s.title}`)}`}>
          <Button icon={<MessageOutlined />}>Ask the Assistant</Button>
        </Link>
        <Popconfirm title="Dismiss this signal?" description="It will leave the open list." okText="Dismiss" onConfirm={acts.dismiss} disabled={closed}>
          <Button danger icon={<DeleteOutlined />} disabled={closed}>Dismiss</Button>
        </Popconfirm>
      </div>

      <h4 style={{ margin: '14px 0 6px' }}>What happened</h4>
      <p className="sec" style={{ margin: 0 }}>{s.detail}</p>

      <h4 style={{ margin: '16px 0 6px' }}>Evidence {!s.real && <Tag color="gold" bordered={false}>Sample</Tag>}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {s.evidence.map((e) => (
          <div key={e.label} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' }}>
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{e.value}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{e.label}</div>
          </div>
        ))}
        {s.impactInr !== null && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' }}>
            <div style={{ fontWeight: 700 }}>{fmtINR(s.impactInr)} / wk</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Estimated contribution at risk</div>
          </div>
        )}
      </div>
      {sample ? (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{s.chartTitle}</div>
          {s.chart!.some((c) => ['Baseline', 'Forecast', 'ROAS'].includes(c.s)) ? (
            <LineChart data={s.chart!} x="x" y="y" color="s" height={170} />
          ) : (
            <ColumnChart data={s.chart!} x="x" y="y" color="s" height={170} />
          )}
        </div>
      ) : (
        <RealEvidence s={s} snaps={snaps} iv={iv} />
      )}

      {s.hyp.length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 6px' }}>Why — hypotheses tested</h4>
          {s.hyp.map((h) => (
            <div key={h.t} style={{ display: 'flex', gap: 10, padding: '6px 0', alignItems: 'flex-start' }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: 'var(--raised)', color: HYP[h.k][2], flex: '0 0 22px' }}>{HYP[h.k][0]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{h.t}</div>
                <div className="muted" style={{ fontSize: 12 }}>{h.n}</div>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{HYP[h.k][1]}</span>
            </div>
          ))}
        </>
      )}

      <h4 style={{ margin: '16px 0 6px' }}>Recommended actions</h4>
      {s.actions.length === 0 && <div className="muted">No action needed.</div>}
      {s.actions.map((a) => {
        const sent = approvalSent.includes(`${s.id}|${a.t}`);
        return (
          <div key={a.t} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{a.t}</div>
            <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>{a.mode} · {a.owner}</div>
            {a.mode === 'Approve' ? (
              sent ? (
                <Link href={`/inbox${query}`}><Tag color="green" bordered={false}>Sent for approval — open the Inbox</Tag></Link>
              ) : (
                <Button size="small" type="primary" icon={<SendOutlined />} disabled={closed} onClick={() => acts.sendForApproval(a.t)}>Send for approval</Button>
              )
            ) : (
              <Button size="small" disabled={closed} onClick={() => acts.sendForApproval(a.t)}>{a.mode === 'Draft' ? 'Open draft' : 'Coordinate'}</Button>
            )}
          </div>
        );
      })}

      <h4 style={{ margin: '16px 0 6px' }}>Timeline</h4>
      <Timeline
        items={[
          ...s.timeline.map((t) => ({ color: t.tone === 'ok' ? 'green' : t.tone === 'warn' ? 'orange' : t.tone === 'act' ? 'purple' : 'gray', children: <div>{t.text}<div className="muted" style={{ fontSize: 12 }}>{t.at ? fmtIST(t.at) : '—'}</div></div> })),
        ]}
      />
      {!closed && s.status !== 'Snoozed' && (
        <Select size="small" style={{ minWidth: 170 }} placeholder="Mark as…" options={[{ value: 'resolve', label: 'Mark resolved' }]} onChange={() => acts.resolve()} />
      )}
    </Card>
  );
}
