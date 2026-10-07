/**
 * All derived numbers live here, so every screen computes them the same way — and so the
 * same functions work unchanged on real backend snapshots.
 */
import type { Availability, SelloutInterval, Snapshot } from '@/lib/types';

// ---------- discount (always calculated, never read from the feed) ----------
export const discountAmount = (mrp: number | null, price: number | null) => (mrp && price !== null && mrp > 0 ? Math.max(0, mrp - price) : 0);
export const discountPct = (mrp: number | null, price: number | null) => (mrp && price !== null && mrp > 0 ? Math.round(((mrp - price) / mrp) * 1000) / 10 : 0);
export const hasDiscount = (s: Pick<Snapshot, 'mrp' | 'selling_price'>) => discountAmount(s.mrp, s.selling_price) > 0;

// ---------- time helpers (store UTC, show IST) ----------
const IST_MS = 5.5 * 3600_000;
export const istDay = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10);
export const istHour = (iso: string) => new Date(Date.parse(iso) + IST_MS).getUTCHours();
export const hoursBetween = (a: string, b: string) => Math.round(((Date.parse(b) - Date.parse(a)) / 3600_000) * 10) / 10;

// ---------- availability ----------
export interface AvailStats {
  total: number;
  available: number;
  out_of_stock: number;
  not_listed: number;
  listed: number;
  /** buyable share of LISTED products */
  buyablePct: number;
}
export function availabilityStats(rows: Pick<Snapshot, 'availability'>[]): AvailStats {
  const c: Record<Availability, number> = { available: 0, out_of_stock: 0, not_listed: 0 };
  rows.forEach((r) => (c[r.availability] += 1));
  const listed = c.available + c.out_of_stock;
  return { total: rows.length, ...c, listed, buyablePct: listed ? Math.round((c.available / listed) * 1000) / 10 : 0 };
}

// ---------- latest snapshot per listing ----------
export const listingKey = (s: Pick<Snapshot, 'platform' | 'city' | 'store_id' | 'pincode' | 'product_id'>) => `${s.platform}|${s.city}|${s.store_id ?? s.pincode}|${s.product_id}`;

export function latestPerListing(snaps: Snapshot[]): Snapshot[] {
  const m = new Map<string, Snapshot>();
  for (const s of snaps) {
    const k = listingKey(s);
    const cur = m.get(k);
    if (!cur || s.scraped_at > cur.scraped_at) m.set(k, s);
  }
  return Array.from(m.values());
}

// ---------- ESTIMATED sell-out from stock change between captures ----------
/**
 * For each listing, sort captures by scraped_at and compare each capture with the one before:
 *   stock went DOWN  -> units sold   = previous stock - current stock
 *   stock went UP    -> a restock; counted separately, never as sales
 *   0 -> 0 (OOS)     -> nothing observable; flagged `oos`
 * It is a LOWER-BOUND ESTIMATE: sales that happen and are restocked inside one capture gap are invisible.
 * Always label the result "Estimate" in the UI.
 */
export function computeSellout(snaps: Snapshot[]): SelloutInterval[] {
  const groups = new Map<string, Snapshot[]>();
  for (const s of snaps) {
    const k = listingKey(s);
    const g = groups.get(k);
    if (g) g.push(s);
    else groups.set(k, [s]);
  }
  const out: SelloutInterval[] = [];
  groups.forEach((g, key) => {
    g.sort((a, b) => (a.scraped_at < b.scraped_at ? -1 : 1));
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1];
      const b = g[i];
      if (a.availability === 'not_listed' || b.availability === 'not_listed') continue;
      const d = a.stock - b.stock;
      const units = d > 0 ? d : 0;
      const price = b.selling_price ?? a.selling_price ?? 0;
      out.push({
        key,
        platform: b.platform,
        city: b.city,
        product_id: b.product_id,
        name: b.name,
        pack_size: b.pack_size,
        line: b.line,
        category: b.category,
        from: a.scraped_at,
        to: b.scraped_at,
        capture_id: b.capture_id,
        day: istDay(b.scraped_at),
        stock_from: a.stock,
        stock_to: b.stock,
        units,
        restocked: d < 0 ? -d : 0,
        price,
        revenue: units * price,
        hours: hoursBetween(a.scraped_at, b.scraped_at),
        oos: a.stock === 0 && b.stock === 0,
      });
    }
  });
  return out;
}

// ---------- generic aggregation ----------
export function groupSum<T>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number): Record<string, number> {
  const o: Record<string, number> = {};
  for (const r of rows) {
    const k = keyFn(r);
    o[k] = (o[k] ?? 0) + valFn(r);
  }
  return o;
}

/** daily series (IST day) of estimated units/revenue, one row per day x series */
export function dailySellout(iv: SelloutInterval[], seriesFn: (r: SelloutInterval) => string = (r) => r.city) {
  const m = new Map<string, { date: string; series: string; units: number; revenue: number; restocked: number }>();
  for (const r of iv) {
    const s = seriesFn(r);
    const k = `${r.day}|${s}`;
    const cur = m.get(k) ?? { date: r.day, series: s, units: 0, revenue: 0, restocked: 0 };
    cur.units += r.units;
    cur.revenue += r.revenue;
    cur.restocked += r.restocked;
    m.set(k, cur);
  }
  return Array.from(m.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Derive a Paper Boat product line from the product name (used for "by line" cuts). */
export function productLine(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('nata de coco')) return 'Nata De Coco';
  if (n.includes('aam panna')) return 'Aam Panna';
  if (n.includes('aamras')) return 'Aamras';
  if (n.includes('coconut water')) return 'Coconut Water';
  if (n.includes('tonic') || n.includes('ginger ale')) return 'Mixers';
  if (n.includes('prebiotic')) return 'Zero Prebiotic Soda';
  if (n.includes('sparkling') || n.includes('soda') || n.includes('coffee')) return 'Zero Fizz';
  if (n.includes('swing')) return 'Swing';
  if (n.includes('zero') || n.includes('jamun') || n.includes('guava') || n.includes('anar')) return 'Zero / Ethnic';
  return 'Other';
}
