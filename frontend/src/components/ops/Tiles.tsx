'use client';

import type { ReactNode } from 'react';

export interface TileItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: 'bad' | 'warn' | 'good';
}

/** Compact KPI row used by the operations pages — wraps to any number of tiles. */
export function Tiles({ items }: { items: TileItem[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 20 }}>
      {items.map((t) => (
        <div key={t.label} className="card lift kpi" style={{ padding: 16 }}>
          <div className="label">
            {t.icon && <span className="icon">{t.icon}</span>}
            {t.label}
          </div>
          <div
            className="value tnum"
            style={{ fontSize: 28, color: t.tone === 'bad' ? 'var(--pb-coral)' : t.tone === 'warn' ? 'var(--pb-sunset)' : t.tone === 'good' ? 'var(--pb-mint)' : undefined }}
          >
            {t.value}
          </div>
          {t.note && <div className="meta">{t.note}</div>}
        </div>
      ))}
    </div>
  );
}
