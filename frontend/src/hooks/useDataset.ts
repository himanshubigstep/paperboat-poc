'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { computeSellout, istDay, latestPerListing } from '@/lib/metrics';
import { useFilters } from '@/hooks/useFilters';

/**
 * The one hook most screens need. Loads every snapshot once (cached), then applies the global
 * platform / city / range filters and derives:
 *   snapshots  — all captures in scope (range applied)
 *   latest     — newest capture of each listing (what is on the shelf now)
 *   intervals  — ESTIMATED sell-out between consecutive captures (see lib/metrics.computeSellout)
 *   captures   — distinct capture ids in scope, oldest -> newest
 */
export function useDataset() {
  const { platforms, cities, range } = useFilters();
  const q = useQuery({ queryKey: ['dataset'], queryFn: api.dataset });

  const derived = useMemo(() => {
    if (!q.data) return null;
    const scoped = q.data.snapshots.filter((s) => platforms.includes(s.platform) && cities.includes(s.city));
    const lastDay = istDay(q.data.meta.captured_at);
    const cutoff = new Date(Date.parse(lastDay + 'T00:00:00Z') - (range - 1) * 86400_000).toISOString().slice(0, 10);
    const snapshots = scoped.filter((s) => istDay(s.scraped_at) >= cutoff);
    return {
      all: scoped,
      snapshots,
      latest: latestPerListing(snapshots),
      intervals: computeSellout(snapshots),
      captures: Array.from(new Set(snapshots.map((s) => s.capture_id))).sort(),
    };
  }, [q.data, platforms, cities, range]);

  return {
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
    meta: q.data?.meta,
    all: derived?.all ?? [],
    snapshots: derived?.snapshots ?? [],
    latest: derived?.latest ?? [],
    intervals: derived?.intervals ?? [],
    captures: derived?.captures ?? [],
  };
}
