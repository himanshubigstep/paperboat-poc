/**
 * Data access. UI → hooks → here. Swap dummy → backend by setting NEXT_PUBLIC_USE_MOCK=false and
 * NEXT_PUBLIC_API_BASE_URL (see ../../.claude/rules/data-contract.md). The backend returns
 * `{ data, meta }`; three captures a day, one `Snapshot` per product x store x capture.
 */
import { getSnapshots } from '@/mock/snapshots';
import type { Meta, Snapshot } from '@/lib/types';

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export async function get<T>(path: string, mock: () => T | Promise<T>): Promise<T> {
  if (USE_MOCK) {
    await wait();
    return mock();
  }
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  return (await res.json()).data as T;
}

export interface Dataset {
  snapshots: Snapshot[];
  meta: Meta;
}

export const api = {
  /** every snapshot, all platforms/cities (filtered client-side by useDataset) */
  dataset: (): Promise<Dataset> =>
    get('/snapshots', () => {
      const snapshots = getSnapshots();
      const last = snapshots[snapshots.length - 1].scraped_at;
      const captures = new Set(snapshots.map((s) => s.capture_id));
      return {
        snapshots,
        meta: {
          captured_at: last,
          captures_per_day: 3,
          capture_count: captures.size,
          first_capture_at: snapshots[0].scraped_at,
          listings: new Set(snapshots.map((s) => `${s.platform}|${s.city}|${s.product_id}`)).size,
          products: new Set(snapshots.map((s) => s.product_id)).size,
        },
      };
    }),
};
