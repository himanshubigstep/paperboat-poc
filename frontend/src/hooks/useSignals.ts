'use client';

import { useMemo } from 'react';
import { useDataset } from '@/hooks/useDataset';
import { deriveSignals } from '@/lib/signals';

/** Signals derived from the data in the current filter scope (see lib/signals.ts). */
export function useSignals() {
  const d = useDataset();
  const signals = useMemo(() => deriveSignals(d.snapshots, d.intervals), [d.snapshots, d.intervals]);
  return { ...d, signals };
}
