'use client';

import type { ReactNode } from 'react';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/ui';

/** Loading / error / empty wrapper shared by the pages in this folder. */
export function Gate({ d, children, emptyText }: { d: { isLoading: boolean; isError: boolean; refetch: () => unknown; latest: unknown[] }; children: ReactNode; emptyText?: string }) {
  if (d.isLoading)
    return (
      <div className="bento">
        <div className="span-12"><SkeletonBlock h={120} /></div>
        <div className="span-6"><SkeletonBlock h={260} /></div>
        <div className="span-6"><SkeletonBlock h={260} /></div>
      </div>
    );
  if (d.isError) return <ErrorState onRetry={() => d.refetch()} />;
  if (!d.latest.length) return <EmptyState text={emptyText ?? 'No captured listings for this platform / city selection.'} />;
  return <>{children}</>;
}

/** Compact stat tile row (the reference's "tiles"). */
export function Tiles({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
      {items.map((t) => (
        <div key={t.label} className="card" style={{ padding: 14 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</div>
          <div className="tnum" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, fontFamily: 'var(--font-display), Space Grotesk, sans-serif' }}>{t.value}</div>
          {t.note && <div className="muted" style={{ fontSize: 12 }}>{t.note}</div>}
        </div>
      ))}
    </div>
  );
}
