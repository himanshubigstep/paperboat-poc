/**
 * Dashboard (Overview · Sales · Assortment · Price & promo) + Home helpers.
 *
 * REAL helpers parse/derive from the shelf capture (pack sizes, price per 100 ml, content health).
 * SAMPLE generators cover only what the capture cannot prove: competitor brands, sell-in, the
 * sales driver bridge, search share, AI insight text. All deterministic (seeded) so SSR matches.
 */
import { discountPct, listingKey, round1, sum } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';

// ---------- seeded RNG ----------
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** deterministic float in [lo, hi) for a text key */
export const seeded = (key: string, lo: number, hi: number) => lo + rng(hash(key))() * (hi - lo);

// ---------- small stats ----------
export function quantile(xs: number[], q: number) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
export const median = (xs: number[]) => quantile(xs, 0.5);

// ---------- REAL: pack-size parsing ("600 ml", "1.2 ltr", "2 x 200 ml") ----------
export function packMl(pack: string): number | null {
  const m = pack.toLowerCase().replace(/\s+/g, ' ').match(/^(?:(\d+) ?x )?([\d.]+) ?(ml|ltr|l|litre|liter)\b/);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 1;
  const v = Number(m[2]);
  return n * (m[3] === 'ml' ? v : v * 1000);
}
export const isMultipack = (pack: string) => /\d\s*x\s*\d/i.test(pack);
export const per100ml = (price: number | null, pack: string): number | null => {
  const ml = packMl(pack);
  return price !== null && ml ? Math.round((price / ml) * 10000) / 100 : null;
};
export const PACK_BUCKETS = ['Under 250 ml', '250–399 ml', '400–699 ml', '700–1000 ml', 'Over 1 L', 'Multipack'] as const;
export function packBucket(pack: string): (typeof PACK_BUCKETS)[number] | null {
  const ml = packMl(pack);
  if (!ml) return null;
  if (isMultipack(pack)) return 'Multipack';
  if (ml < 250) return 'Under 250 ml';
  if (ml < 400) return '250–399 ml';
  if (ml < 700) return '400–699 ml';
  if (ml <= 1000) return '700–1000 ml';
  return 'Over 1 L';
}
export const DISC_BANDS = ['No discount', '1–9%', '10–19%', '20%+'] as const;
export function discBand(s: Pick<Snapshot, 'mrp' | 'selling_price'>): (typeof DISC_BANDS)[number] {
  const p = discountPct(s.mrp, s.selling_price);
  return p <= 0 ? 'No discount' : p < 10 ? '1–9%' : p < 20 ? '10–19%' : '20%+';
}

export const listed = (rows: Snapshot[]) => rows.filter((r) => r.availability !== 'not_listed');

// ---------- REAL: content & listing health, computed from the capture ----------
export interface HealthCheck {
  key: string;
  label: string;
  n: number;
  weight: number;
  hint: string;
}
export interface ContentHealth {
  audited: number;
  clean: number;
  cleanPct: number;
  defects: number;
  score: number;
  checks: HealthCheck[];
  byPlatform: { platform: string; audited: number; score: number }[];
}
const CHECKS: { key: string; label: string; weight: number; hint: string; fails: (r: Snapshot, dup: Set<string>) => boolean }[] = [
  { key: 'pack_unreadable', label: 'Pack size not stated', weight: 3, hint: 'The listing never says how much is in the pack.', fails: (r) => packMl(r.pack_size) === null },
  { key: 'no_price', label: 'Price or MRP missing', weight: 4, hint: 'A listed product with no price or no MRP.', fails: (r) => r.mrp === null || r.selling_price === null },
  { key: 'price_above_mrp', label: 'Price above MRP', weight: 4, hint: 'Selling price is higher than the printed MRP.', fails: (r) => r.mrp !== null && r.selling_price !== null && r.selling_price > r.mrp },
  { key: 'no_category', label: 'Category missing', weight: 2, hint: 'Product has no category path, so it will not appear on category shelves.', fails: (r) => !r.category },
  { key: 'no_shelf_life', label: 'Shelf life missing', weight: 1, hint: 'No shelf-life / expiry information on the listing.', fails: (r) => r.shelf_life_days === null },
  { key: 'no_marketer', label: 'Marketer / FSSAI details missing', weight: 1, hint: 'Marketer address is required on food listings.', fails: (r) => !r.marketer },
  { key: 'duplicate_listing', label: 'Duplicate listing', weight: 3, hint: 'The same product and pack is live twice in one store.', fails: (r, dup) => dup.has(`${r.platform}|${r.city}|${r.store_id ?? r.pincode}|${r.name}|${r.pack_size}`) },
];
export function contentHealth(latest: Snapshot[]): ContentHealth {
  const rows = listed(latest);
  const seen = new Map<string, number>();
  rows.forEach((r) => {
    const k = `${r.platform}|${r.city}|${r.store_id ?? r.pincode}|${r.name}|${r.pack_size}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  });
  const dup = new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  const checks: HealthCheck[] = CHECKS.map((c) => ({ key: c.key, label: c.label, weight: c.weight, hint: c.hint, n: rows.filter((r) => c.fails(r, dup)).length }));
  const failing = (r: Snapshot) => CHECKS.filter((c) => c.fails(r, dup));
  const scoreOf = (rs: Snapshot[]) => {
    if (!rs.length) return 0;
    const maxW = sum(CHECKS.map((c) => c.weight));
    const lost = sum(rs.map((r) => sum(failing(r).map((c) => c.weight)))) / (rs.length * maxW);
    return Math.round((1 - lost) * 100);
  };
  const clean = rows.filter((r) => failing(r).length === 0).length;
  const platforms = Array.from(new Set(rows.map((r) => r.platform)));
  return {
    audited: rows.length,
    clean,
    cleanPct: rows.length ? round1((clean / rows.length) * 100) : 0,
    defects: sum(checks.map((c) => c.n)),
    score: scoreOf(rows),
    checks,
    byPlatform: platforms.map((p) => ({ platform: p, audited: rows.filter((r) => r.platform === p).length, score: scoreOf(rows.filter((r) => r.platform === p)) })),
  };
}

/** distinct canonical SKU key (name + pack) */
export const skuKey = (r: Pick<Snapshot, 'name' | 'pack_size'>) => `${r.name}|${r.pack_size}`;
export { listingKey };

// ---------- SAMPLE: competitor brands ----------
export interface RivalBrand {
  brand: string;
  per100: number; // median ₹ per 100 ml
  spread: number; // relative width of the 25–75 percentile band
  mrp: number; // avg MRP
  disc: number; // avg discount %
  buyable: number; // buyable %
  weight: number; // relative number of listings on the shelf
}
const RIVAL_BASE: Omit<RivalBrand, 'spread'>[] = [
  { brand: 'Real', per100: 22.5, mrp: 130, disc: 9, buyable: 93, weight: 1.0 },
  { brand: 'B Natural', per100: 21.0, mrp: 120, disc: 11, buyable: 91, weight: 0.8 },
  { brand: 'Tropicana', per100: 20.0, mrp: 125, disc: 12, buyable: 90, weight: 0.9 },
  { brand: 'Minute Maid', per100: 17.5, mrp: 85, disc: 8, buyable: 94, weight: 0.7 },
  { brand: 'Raw Pressery', per100: 49.0, mrp: 160, disc: 6, buyable: 84, weight: 0.4 },
  { brand: 'Frooti', per100: 11.5, mrp: 40, disc: 4, buyable: 96, weight: 0.9 },
  { brand: 'Maaza', per100: 11.0, mrp: 55, disc: 5, buyable: 95, weight: 0.8 },
  { brand: 'Slice', per100: 11.2, mrp: 55, disc: 5, buyable: 95, weight: 0.6 },
];
export const rivalBrands = (): RivalBrand[] => RIVAL_BASE.map((b) => ({ ...b, spread: 0.15 + seeded(b.brand + 'spread', 0, 0.2) }));

/** per-platform wiggle so every platform reads slightly differently, same every render */
const wig = (key: string, base: number, pct: number) => round1(base * (1 + (seeded(key, -1, 1) * pct) / 100));
export const rivalDisc = (brand: string, platform: string) => Math.max(0, wig(`${brand}|${platform}|d`, RIVAL_BASE.find((b) => b.brand === brand)?.disc ?? 6, 40));
export const rivalListings = (brand: string, platform: string) => Math.round(((RIVAL_BASE.find((b) => b.brand === brand)?.weight ?? 0.5) * 140) * (0.7 + seeded(`${brand}|${platform}|n`, 0, 0.6)));
export const rivalBuyable = (brand: string, platform: string) => Math.min(99, wig(`${brand}|${platform}|b`, RIVAL_BASE.find((b) => b.brand === brand)?.buyable ?? 90, 6));
/** the rivals Paper Boat actually meets on a shelf: median ₹/100 ml on a platform (sample) */
export const rivalsMedianPer100 = (platform: string) => round1(wig(`${platform}|rivalmed`, median(RIVAL_BASE.slice(0, 5).map((b) => b.per100)), 8));

// ---------- SAMPLE: search ----------
export const searchShare = (platform: string) => round1(seeded(`${platform}|sos`, 9, 26));
export const searchResults = (platform: string) => Math.round(seeded(`${platform}|sosn`, 380, 1100));
export const deliveryMinutes = (platform: string) => Math.round(seeded(`${platform}|eta`, 9, 22));

export const KEYWORDS = ['fruit juice', 'coconut water', 'mango drink', 'summer drinks', 'party mixers', 'zero sugar drink', 'aam panna', 'tonic water'];
export interface AbsentShelf {
  keyword: string;
  city: string;
  platform: string;
  results: number;
}
export function absentShelves(platforms: string[], cities: string[]): AbsentShelf[] {
  const out: AbsentShelf[] = [];
  for (const p of platforms) for (const c of cities) for (const k of KEYWORDS) {
    if (seeded(`${k}|${c}|${p}|abs`, 0, 1) < 0.3) out.push({ keyword: k, city: c, platform: p, results: Math.round(seeded(`${k}|${c}|${p}|res`, 12, 120)) });
  }
  return out;
}

// ---------- SAMPLE: sell-in, bridge, insights ----------
export function sellIn(dayUnits: { date: string; units: number }[]) {
  return dayUnits.map((d) => ({ date: d.date, units: Math.round(d.units * (1.08 + seeded(`sellin|${d.date}`, -0.12, 0.2)) + 6) }));
}
export interface BridgeStep { label: string; value: number }
/** prior → distribution → velocity → price → mix → current; the steps always add up to current − prior */
export function salesBridge(current: number): BridgeStep[] {
  const growth = seeded(`bridge|${Math.round(current)}`, 0.03, 0.09);
  const prior = current / (1 + growth);
  const delta = current - prior;
  const parts = [0.38, 0.52, -0.12, 0.22];
  const labels = ['Distribution', 'Velocity', 'Price', 'Mix'];
  return [{ label: 'Prior period', value: prior }, ...parts.map((p, i) => ({ label: labels[i], value: delta * p })), { label: 'Current period', value: current }];
}

export interface Insight { title: string; why: string; actions: string[] }
export function aiInsights(a: { buyablePct: number; oos: number; topCity: string | null; topLine: string | null; avgDisc: number; gapCity: string | null }): Insight[] {
  return [
    { title: `Buyable availability is ${a.buyablePct}% with ${a.oos} listing${a.oos === 1 ? '' : 's'} out of stock`, why: 'Out-of-stock listings lose sell-out the same day; restock requests recover most of it within a capture cycle.', actions: ['Open stock-outs', 'Notify supply'] },
    ...(a.topLine ? [{ title: `${a.topLine} leads estimated sell-out${a.topCity ? `, strongest in ${a.topCity}` : ''}`, why: 'Estimated from stock movement between captures; treat as a lower bound.', actions: ['See sales'] }] : []),
    { title: `Average discount on the shelf is ${a.avgDisc}%`, why: 'Rival brands are discounting deeper on several platforms; hold price unless velocity drops.', actions: ['Open price & promo'] },
    ...(a.gapCity ? [{ title: `${a.gapCity} is missing SKUs that are listed elsewhere`, why: 'A listing present in one city and absent in another is usually a catalogue or serviceability gap.', actions: ['See assortment gaps'] }] : []),
  ];
}
