'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { CityFilter } from '@/lib/types';

export type Range = 7 | 14;

/** Global filters live in the URL so they survive refresh and apply on every screen. */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawCity = sp.get('city');
  const city: CityFilter = rawCity === 'Delhi' || rawCity === 'Mumbai' ? rawCity : 'Both';
  const range: Range = sp.get('range') === '7' ? 7 : 14;

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      Object.entries(patch).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)));
      router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
    },
    [sp, router, pathname],
  );

  return { city, range, set, query: sp.toString() ? `?${sp.toString()}` : '' };
}

export const lastDays = <T extends { date: string }>(rows: T[], range: Range, allDays = 14) => {
  const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
  const keep = new Set(dates.slice(-Math.min(range, allDays)));
  return rows.filter((r) => keep.has(r.date));
};
