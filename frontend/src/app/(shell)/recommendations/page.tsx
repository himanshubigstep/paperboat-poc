'use client';

import { Button, Drawer, Progress, Segmented, Tag, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Card, CityTag, EmptyState, ErrorState, PageHead, PaidTag, PlatformTag, Prov, SkeletonBlock } from '@/components/ui';
import { useSignals } from '@/hooks/useSignals';
import type { Severity, Signal } from '@/lib/types';

interface Rec {
  id: string;
  priority: number;
  signal: Signal;
  action: string;
  why: string;
  type: 'free' | 'paid';
  evidence: { label: string; query_id: string }[];
}

const WEIGHT: Record<Severity, number> = { critical: 1, high: 0.8, medium: 0.55, low: 0.3 };

/** rule → action. Priority = severity × confidence. Suggestions only, nothing is executed. */
function toRec(s: Signal, i: number): Rec {
  const base = { id: `rec-${i + 1}`, signal: s, priority: Math.round(WEIGHT[s.severity] * s.confidence), evidence: [{ label: s.rule, query_id: `q-${2000 + i * 3}` }, { label: 'Capture history', query_id: `q-${2001 + i * 3}` }] };
  switch (s.type) {
    case 'Availability':
      return s.metric === 'Buyable'
        ? { ...base, type: 'free', action: `Escalate a restock: ${s.product}`, why: `${s.detail} Each capture it stays out is demand that cannot be served.` }
        : { ...base, type: 'free', action: `Check stock depth before the next capture in ${s.city}`, why: s.detail };
    case 'Pricing':
      return s.metric === 'City price gap'
        ? { ...base, type: 'free', action: `Align the price of ${s.product} across cities`, why: s.detail }
        : { ...base, type: 'free', action: `Review the promotion on ${s.product}`, why: s.detail };
    case 'Inventory & expiry':
      return { ...base, type: 'free', action: `Watch sell-through on ${s.product}`, why: s.detail };
    case 'Data quality':
      return { ...base, type: 'free', action: 'Review the listings that returned no price', why: s.detail };
    default:
      return { ...base, type: 'free', action: s.title, why: s.detail };
  }
}

export default function Recommendations() {
  const { signals, isLoading, isError, refetch } = useSignals();
  const router = useRouter();
  const [type, setType] = useState<'all' | 'free' | 'paid'>('all');
  const [open, setOpen] = useState<Rec | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const recs = useMemo(() => signals.map(toRec).sort((a, b) => b.priority - a.priority), [signals]);
  const rows = recs.filter((r) => type === 'all' || r.type === type);

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <>
      <PageHead title="Recommendations" sub="Suggested actions from the agreed rules, ranked by priority — suggestions only, nothing is executed" actions={<Segmented value={type} onChange={(v) => setType(v as typeof type)} options={[{ label: 'All', value: 'all' }, { label: 'Free', value: 'free' }, { label: 'Paid', value: 'paid' }]} />} />
      {isLoading ? <SkeletonBlock h={360} /> : rows.length === 0 ? <Card lift={false}><EmptyState text="No recommendations for this scope. Paid actions need a search-rank feed, which is not connected yet." /></Card> : (
        <div className="bento">
          {rows.map((r) => (
            <Card key={r.id} className="span-6" hero={r.priority >= 80}>
              <div style={{ display: 'flex', gap: 16 }}>
                <Progress type="circle" size={64} percent={Math.min(100, r.priority)} format={(p) => <b>{p}</b>} strokeColor={r.priority >= 70 ? '#FF6B6B' : r.priority >= 45 ? '#FF9F43' : '#7C5CFF'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <PlatformTag id={r.signal.platform} /><CityTag city={r.signal.city} /><PaidTag type={r.type} />{done[r.id] && <Tag bordered={false} color="green">done</Tag>}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 17 }}>{r.action}</h3>
                  <p className="sec" style={{ margin: '8px 0 10px', fontSize: 13.5 }}>{r.why}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button size="small" type="primary" onClick={() => setOpen(r)}>Why?</Button>
                    <Button size="small" onClick={() => { setDone((d) => ({ ...d, [r.id]: !d[r.id] })); message.success(done[r.id] ? 'Marked open again' : 'Marked as done'); }}>{done[r.id] ? 'Reopen' : 'Mark done'}</Button>
                    <Button size="small" onClick={() => router.push(`/assistant?q=${encodeURIComponent(`Tell me more: ${r.action}`)}`)}>Ask a follow-up</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16 }}><Prov>Rule engine on the shelf capture · priority = severity × confidence</Prov></div>

      <Drawer open={!!open} onClose={() => setOpen(null)} width={480} title="Why this recommendation">
        {open && (
          <div style={{ display: 'grid', gap: 16 }}>
            <h3 style={{ margin: 0 }}>{open.action}</h3>
            <p className="sec" style={{ margin: 0 }}>{open.why}</p>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>Rule</div>
              <b>{open.signal.rule}</b>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Observed</div>
              <b>{open.signal.metric}: {open.signal.delta}</b> · {open.signal.confidence}% confidence
            </div>
            <div><b>Evidence</b>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {open.evidence.map((e) => (
                  <div key={e.query_id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between' }}><span>{e.label}</span><Tag bordered={false}>{e.query_id}</Tag></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
