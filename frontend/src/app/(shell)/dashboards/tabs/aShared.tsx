'use client';

import type { ReactNode } from 'react';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';

/** Handles loading / error / empty for a dashboard tab; renders children once data is ready. */
export function TabGate({ d, children }: { d: ReturnType<typeof useDataset>; children: ReactNode }) {
  if (d.isLoading) {
    return (
      <div className="bento">
        <div className="span-12"><SkeletonBlock h={110} /></div>
        <div className="span-8"><SkeletonBlock h={300} /></div>
        <div className="span-4"><SkeletonBlock h={300} /></div>
      </div>
    );
  }
  if (d.isError) return <ErrorState onRetry={() => d.refetch()} />;
  if (!d.latest.length) return <EmptyState text="No captured listings for this platform and city selection." />;
  return <>{children}</>;
}

/** Horizontal range bar: 25–75 percentile band with a median tick (used for ₹ per 100 ml). */
export function RangeRow({ label, p25, p75, med, max, highlight }: { label: string; p25: number; p75: number; med: number; max: number; highlight?: boolean }) {
  const pc = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 64px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
      <span style={{ fontWeight: highlight ? 700 : 500, fontSize: 13 }}>{label}</span>
      <div role="img" aria-label={`${label} median ${med}, range ${p25} to ${p75}`} style={{ position: 'relative', height: 14, borderRadius: 8, background: 'var(--raised)' }}>
        <div style={{ position: 'absolute', left: pc(p25), width: `calc(${pc(p75)} - ${pc(p25)})`, top: 0, bottom: 0, borderRadius: 8, background: highlight ? 'var(--pb-violet)' : 'var(--ink-3)', opacity: 0.35 }} />
        <div style={{ position: 'absolute', left: pc(med), top: -2, bottom: -2, width: 4, borderRadius: 2, background: highlight ? 'var(--pb-violet)' : 'var(--ink-2)' }} />
      </div>
      <span className="tnum" style={{ textAlign: 'right', fontSize: 13 }}>₹{med.toFixed(1)}</span>
    </div>
  );
}

/** Waterfall made of plain divs: first and last are totals, middle steps float. */
export function Bridge({ steps, fmt }: { steps: { label: string; value: number }[]; fmt: (v: number) => string }) {
  const first = steps[0].value;
  const lo = Math.min(first, steps[steps.length - 1].value) * 0.9;
  const hi = Math.max(first, steps[steps.length - 1].value) * 1.04;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  let run = first;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 240 }} role="img" aria-label="Sales driver bridge">
      {steps.map((s, i) => {
        const total = i === 0 || i === steps.length - 1;
        const start = total ? lo : run;
        const end = total ? s.value : run + s.value;
        if (!total) run = end;
        const bottom = pos(Math.min(start, end));
        const h = Math.max(2, Math.abs(pos(end) - pos(start)));
        const color = total ? 'var(--pb-violet)' : s.value >= 0 ? 'var(--pb-mint)' : 'var(--pb-coral)';
        return (
          <div key={s.label} style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 22, top: 0 }}>
              <div style={{ position: 'absolute', left: '12%', right: '12%', bottom: `${bottom}%`, height: `${h}%`, background: color, borderRadius: 6 }} />
              <div className="tnum" style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${bottom + h}% + 4px)`, textAlign: 'center', fontSize: 11.5 }}>{total ? fmt(s.value) : `${s.value >= 0 ? '+' : '−'}${fmt(Math.abs(s.value))}`}</div>
            </div>
            <div style={{ height: 20, textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}
