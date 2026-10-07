'use client';

import { Collapse, Segmented, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CityTag, ErrorState, PageHead, PaidTag, Prov, SevTag, SkeletonBlock, fmtIST, EmptyState } from '@/components/ui';
import { useFilters } from '@/hooks/useFilters';
import { api } from '@/lib/api';
import type { Severity, Signal } from '@/lib/types';

export default function Signals() {
  const { city } = useFilters();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['signals'], queryFn: api.signals });
  const [sev, setSev] = useState<Severity | 'all'>('all');
  const [type, setType] = useState<Signal['type'] | 'all'>('all');
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const rows = (data ?? []).filter((s) => (sev === 'all' || s.severity === sev) && (type === 'all' || s.type === type) && (city === 'Both' || s.city === city || s.city === 'Both'));
  return (
    <>
      <PageHead title="Signals & Insights" sub="What changed on the shelf, ranked by urgency and confidence" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Segmented<Severity | 'all'> value={sev} onChange={setSev} options={[{ label: 'All', value: 'all' }, { label: 'Critical', value: 'critical' }, { label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }]} />
        <Segmented<Signal['type'] | 'all'> value={type} onChange={setType} options={[{ label: 'Any type', value: 'all' }, { label: 'Availability', value: 'availability' }, { label: 'Price', value: 'price' }, { label: 'Search', value: 'search' }, { label: 'Sell-out', value: 'sellout' }, { label: 'Quality', value: 'quality' }]} />
      </div>
      {isLoading ? <SkeletonBlock h={360} /> : rows.length === 0 ? <Card lift={false}><EmptyState /></Card> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((s) => (
            <section key={s.id} id={s.id} className="card lift" style={{ display: 'flex', gap: 14, padding: 18 }}>
              <span className={`sev ${s.severity}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                  <SevTag v={s.severity} /><CityTag city={s.city} /><Tag bordered={false}>{s.type}</Tag><PaidTag type={s.free_or_paid} />
                  <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{fmtIST(s.detected_at)}</span>
                </div>
                <h3 style={{ margin: 0, fontSize: 18 }}>{s.title}</h3>
                <p className="sec" style={{ margin: '6px 0 10px' }}>{s.detail}</p>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
                  <span><span className="muted">{s.metric}</span> <b>{s.delta}</b></span>
                  <span><span className="muted">Confidence</span> <b>{s.confidence}%</b></span>
                  {s.product && <span><span className="muted">Product</span> <b>{s.product}</b></span>}
                </div>
                <Collapse ghost size="small" style={{ marginTop: 6 }} items={[{ key: 'ev', label: 'Why this fired', children: <div className="sec" style={{ fontSize: 13 }}>Rule: <b>{s.rule}</b>. Evaluated on the latest capture; every figure is traceable to a stored record.</div> }]} />
              </div>
            </section>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16 }}><Prov>Shelf capture · rules evaluated each run</Prov></div>
    </>
  );
}
