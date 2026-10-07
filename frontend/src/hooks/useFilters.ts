'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { CITIES, CONNECTED_CITIES, CONNECTED_PLATFORMS, PLATFORMS, platformLabel } from '@/lib/config';

export type Range = 7 | 14;

/**
 * Global filters, kept in the URL (?platform=blinkit&city=Delhi,Mumbai&range=7) so they survive
 * refresh and apply on every screen. No param = "everything connected".
 */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const platformParam = sp.get('platform');
  const cityParam = sp.get('city');
  const platforms = useMemo(() => {
    const ids = platformParam?.split(',').filter((id) => PLATFORMS.some((p) => p.id === id)) ?? [];
    return ids.length ? ids : CONNECTED_PLATFORMS.map((p) => p.id);
  }, [platformParam]);
  const cities = useMemo(() => {
    const ids = cityParam?.split(',').filter((id) => CITIES.some((c) => c.id === id)) ?? [];
    return ids.length ? ids : CONNECTED_CITIES.map((c) => c.id);
  }, [cityParam]);
  const range: Range = sp.get('range') === '7' ? 7 : 14;

  const set = useCallback(
    (patch: { platform?: string[] | null; city?: string[] | null; range?: Range | null; [k: string]: unknown }) => {
      const next = new URLSearchParams(sp.toString());
      const apply = (k: string, v: string[] | string | number | null | undefined, def?: string) => {
        const val = Array.isArray(v) ? v.join(',') : v === null || v === undefined ? '' : String(v);
        if (!val || val === def) next.delete(k);
        else next.set(k, val);
      };
      if ('platform' in patch) apply('platform', patch.platform, CONNECTED_PLATFORMS.map((p) => p.id).join(','));
      if ('city' in patch) apply('city', patch.city, CONNECTED_CITIES.map((c) => c.id).join(','));
      if ('range' in patch) apply('range', patch.range, '14');
      Object.entries(patch).forEach(([k, v]) => {
        if (!['platform', 'city', 'range'].includes(k)) apply(k, v as string | null);
      });
      router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
    },
    [sp, router, pathname],
  );

  const scopeLabel = `${platforms.map(platformLabel).join(' + ')} · ${cities.join(' + ')}`;
  /** carry the global filters when linking between pages */
  const keep = ['platform', 'city', 'range'].filter((k) => sp.get(k)).map((k) => `${k}=${sp.get(k)}`).join('&');
  const query = keep ? `?${keep}` : '';

  return { platforms, cities, range, set, scopeLabel, query, multiPlatform: platforms.length > 1, multiCity: cities.length > 1 };
}

export const lastDays = <T extends { date: string }>(rows: T[], range: Range) => {
  const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
  const keep = new Set(dates.slice(-range));
  return rows.filter((r) => keep.has(r.date));
};
