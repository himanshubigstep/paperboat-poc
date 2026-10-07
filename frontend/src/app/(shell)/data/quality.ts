import { listingKey } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';
import { istDay } from '@/lib/metrics';
import { isUntitled, parsePack } from '@/components/pagekit/catalogue';

export interface QCheck {
  id: string;
  check: string;
  dataset: string;
  rule: string;
  checked: number;
  failed: number;
  status: 'pass' | 'warn' | 'fail';
  rows: Snapshot[];
}

const mk = (id: string, check: string, dataset: string, rule: string, checked: number, rows: Snapshot[]): QCheck => ({
  id, check, dataset, rule, checked, failed: rows.length, rows,
  status: rows.length === 0 ? 'pass' : rows.length / Math.max(1, checked) <= 0.1 ? 'warn' : 'fail',
});

/** Quality checks computed on the REAL snapshots in scope. */
export function runQuality(snapshots: Snapshot[], latest: Snapshot[], capturesPerDay: number): QCheck[] {
  const listed = latest.filter((r) => r.availability !== 'not_listed');
  const newest = latest.reduce((m, r) => (r.scraped_at > m ? r.scraped_at : m), '');
  const stale = latest.filter((r) => Date.parse(newest) - Date.parse(r.scraped_at) > 8 * 3600_000);
  const seen = new Map<string, Snapshot>();
  const dupes: Snapshot[] = [];
  snapshots.forEach((s) => {
    const k = `${listingKey(s)}|${s.capture_id}`;
    if (seen.has(k)) dupes.push(s);
    else seen.set(k, s);
  });
  const perDay = new Map<string, Set<string>>();
  snapshots.forEach((s) => (perDay.get(istDay(s.scraped_at)) ?? perDay.set(istDay(s.scraped_at), new Set()).get(istDay(s.scraped_at))!).add(s.capture_id));
  const days = Array.from(perDay.entries()).sort();
  const shortDays = days.slice(0, -1).filter(([, v]) => v.size < capturesPerDay);
  const cadenceRows = snapshots.filter((s) => shortDays.some(([d]) => d === istDay(s.scraped_at))).slice(0, 50);
  return [
    mk('price', 'Selling price present', 'listing_snapshot', 'A listed product must carry a selling price', listed.length, listed.filter((r) => r.selling_price === null)),
    mk('mrp', 'MRP present', 'listing_snapshot', 'A listed product must carry an MRP', listed.length, listed.filter((r) => r.mrp === null)),
    mk('gt_mrp', 'Selling price not above MRP', 'listing_snapshot', 'selling_price ≤ mrp', listed.length, listed.filter((r) => r.mrp !== null && r.selling_price !== null && r.selling_price > r.mrp)),
    mk('stale', 'Capture is fresh', 'listing_snapshot', 'Listing captured within 8 hours of the newest capture', latest.length, stale),
    mk('neg', 'Stock not negative', 'listing_snapshot', 'stock ≥ 0 on every capture', snapshots.length, snapshots.filter((r) => r.stock < 0)),
    mk('stock_state', 'Stock agrees with availability', 'listing_snapshot', 'Buyable → stock > 0; out of stock → stock = 0', listed.length, listed.filter((r) => (r.availability === 'available' && r.stock <= 0) || (r.availability === 'out_of_stock' && r.stock > 0))),
    mk('dupe', 'No duplicate listing in a capture', 'listing_snapshot', 'One row per listing per capture', snapshots.length, dupes),
    mk('title', 'Listing carries a title', 'product_offer', 'Every captured id has a name, pack and category', latest.length, latest.filter((r) => isUntitled(r))),
    mk('pack', 'Pack size parses', 'product_offer', 'pack_size reads as “N x size unit”', listed.length, listed.filter((r) => !parsePack(r.pack_size))),
    mk('shelf', 'Shelf life present', 'product_offer', 'shelf_life_days is set on listed products', listed.length, listed.filter((r) => r.shelf_life_days === null)),
    { ...mk('cadence', 'Capture cadence', 'capture_log', `${capturesPerDay} captures on every full day (failed = days short)`, Math.max(1, days.length - 1), cadenceRows), failed: shortDays.length, status: shortDays.length ? 'warn' : 'pass' },
  ];
}
