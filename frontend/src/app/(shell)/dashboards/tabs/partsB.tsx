'use client';

import type { ReactNode } from 'react';
import { Card, EmptyState, ErrorState, SkeletonBlock } from '@/components/ui';
import type { Snapshot } from '@/lib/types';

/** loading / error / empty wrapper shared by the tabs */
export function Gate({ loading, error, onRetry, empty, children }: { loading: boolean; error: boolean; onRetry: () => void; empty?: boolean; children: ReactNode }) {
  if (loading)
    return (
      <div className="bento">
        <div className="span-12"><SkeletonBlock h={120} /></div>
        <div className="span-6"><SkeletonBlock h={300} /></div>
        <div className="span-6"><SkeletonBlock h={300} /></div>
      </div>
    );
  if (error) return <Card lift={false}><ErrorState onRetry={onRetry} /></Card>;
  if (empty) return <Card lift={false}><EmptyState text="No data for this platform and city selection." /></Card>;
  return <>{children}</>;
}

/** distinct Paper Boat product lines on the shelf now, with how many listings each carries */
export function linesOf(latest: Snapshot[]): { line: string; listings: number }[] {
  const m = new Map<string, Set<string>>();
  latest.filter((s) => s.availability !== 'not_listed' || s.name).forEach((s) => (m.get(s.line) ?? m.set(s.line, new Set()).get(s.line)!).add(s.product_id));
  return Array.from(m.entries()).map(([line, set]) => ({ line, listings: set.size })).sort((a, b) => b.listings - a.listings);
}

export const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// ---------------------------------------------------------------- inventory (real: stock + estimated sell-out)
import { listingKey, round1 } from '@/lib/metrics';
import type { SelloutInterval } from '@/lib/types';

export type InvRisk = 'Dead-stock risk' | 'Low cover' | 'Watch' | 'Out of stock' | 'Healthy';
export interface InvRow {
  key: string; product_id: string; name: string; pack: string; line: string; city: string; platform: string;
  stock: number; perDay: number; cover: number | null; shelfLifeDays: number | null; price: number; risk: InvRisk;
}
/** Days of cover = latest stock / ESTIMATED units per day (from stock changes between captures). Shelf life from the capture. */
export function computeInventory(latest: Snapshot[], iv: SelloutInterval[]): InvRow[] {
  const per = new Map<string, { units: number; hours: number }>();
  iv.forEach((i) => { const c = per.get(i.key) ?? { units: 0, hours: 0 }; c.units += i.units; c.hours += i.hours; per.set(i.key, c); });
  const g = new Map<string, InvRow>();
  latest.filter((s) => s.availability !== 'not_listed').forEach((s) => {
    const k = `${s.platform}|${s.city}|${s.product_id}`;
    const p = per.get(listingKey(s));
    const rate = p && p.hours > 0 ? p.units / (p.hours / 24) : 0;
    const cur = g.get(k) ?? { key: k, product_id: s.product_id, name: s.name.replace(/^paper boat\s+/i, ''), pack: s.pack_size, line: s.line, city: s.city, platform: s.platform, stock: 0, perDay: 0, cover: null, shelfLifeDays: s.shelf_life_days, price: s.selling_price ?? 0, risk: 'Healthy' as InvRisk };
    cur.stock += s.stock;
    cur.perDay += rate;
    g.set(k, cur);
  });
  return Array.from(g.values()).map((r) => {
    const cover = r.perDay > 0 ? round1(r.stock / r.perDay) : null;
    let risk: InvRisk = 'Healthy';
    if (r.stock === 0) risk = 'Out of stock';
    else if (cover !== null && r.shelfLifeDays && cover / r.shelfLifeDays >= 0.25) risk = 'Dead-stock risk';
    else if (cover !== null && cover < 2) risk = 'Low cover';
    else if (r.shelfLifeDays !== null && r.shelfLifeDays < 90) risk = 'Watch';
    return { ...r, perDay: round1(r.perDay), cover, risk };
  });
}
