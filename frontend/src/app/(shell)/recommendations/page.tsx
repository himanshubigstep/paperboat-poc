'use client';

import { Button, Drawer, Progress, Segmented, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CityTag, EmptyState, ErrorState, PageHead, PaidTag, Prov, SkeletonBlock } from '@/components/ui';
import { useFilters } from '@/hooks/useFilters';
import { api } from '@/lib/api';
import type { Recommendation } from '@/lib/types';

const statusColor = { new: 'purple', reviewing: 'gold', done: 'green' } as const;

export default function Recommendations() {
  const { city } = useFilters();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['recs'], queryFn: api.recommendations });
  const [type, setType] = useState<'all' | 'free' | 'paid'>('all');
  const [open, setOpen] = useState<Recommendation | null>(null);
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const rows = (data ?? []).filter((r) => (type === 'all' || r.type === type) && (city === 'Both' || r.city === city || r.city === 'Both'));
  return (
    <>
      <PageHead title="Recommendations" sub="Suggested actions from agreed rules — suggestions only, nothing is executed" actions={<Segmented value={type} onChange={(v) => setType(v as typeof type)} options={[{ label: 'All', value: 'all' }, { label: 'Free', value: 'free' }, { label: 'Paid', value: 'paid' }]} />} />
      {isLoading ? <SkeletonBlock h={360} /> : rows.length === 0 ? <Card lift={false}><EmptyState /></Card> : (
        <div className="bento">
          {rows.map((r) => (
            <Card key={r.id} className="span-6" hero={r.priority >= 90}>
              <div style={{ display: 'flex', gap: 16 }}>
                <Progress type="circle" size={64} percent={r.priority} format={(p) => <b>{p}</b>} strokeColor={r.priority >= 80 ? '#FF6B6B' : r.priority >= 60 ? '#FF9F43' : '#7C5CFF'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <CityTag city={r.city} /><PaidTag type={r.type} /><Tag bordered={false} color={statusColor[r.status]}>{r.status}</Tag>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 17 }}>{r.action}</h3>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{r.product}</div>
                  <p className="sec" style={{ margin: '10px 0', fontSize: 13.5 }}>{r.why}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button size="small" type="primary" onClick={() => setOpen(r)}>Why?</Button>
                    <Button size="small" onClick={() => router.push(`/assistant?q=${encodeURIComponent(`Tell me more: ${r.action}`)}`)}>Ask a follow-up</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16 }}><Prov>Rule engine · priority = impact × urgency × confidence</Prov></div>

      <Drawer open={!!open} onClose={() => setOpen(null)} width={480} title="Why this recommendation">
        {open && (
          <div style={{ display: 'grid', gap: 16 }}>
            <h3 style={{ margin: 0 }}>{open.action}</h3>
            <p className="sec" style={{ margin: 0 }}>{open.why}</p>
            <div><b>Evidence</b>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {open.evidence.map((e) => (
                  <div key={e.query_id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{e.label}</span><Tag bordered={false}>{e.query_id}</Tag>
                  </div>
                ))}
              </div>
            </div>
            <span className="muted" style={{ fontSize: 12.5 }}>Each evidence item opens the exact query and rows once the data service is connected.</span>
          </div>
        )}
      </Drawer>
    </>
  );
}
