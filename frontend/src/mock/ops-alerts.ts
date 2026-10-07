/**
 * Alert rule book. Rules the shelf capture can prove are EVALUATED against the dataset in the active
 * filter scope (match counts are real and move when the threshold is edited). The rest are SAMPLE.
 */
import { platformLabel } from '@/lib/config';
import { discountPct, listingKey, round1 } from '@/lib/metrics';
import type { SelloutInterval, Severity, Snapshot } from '@/lib/types';
import { type Anchor, intBetween, pickOf, productLabel, RIVALS, rng } from '@/mock/ops-common';

export const CHANNELS = ['Email + Slack', 'Email + in-app', 'Daily digest email', 'Weekly digest email', 'In-app'] as const;
export const FREQUENCIES = ['Every capture', 'Daily 07:30', 'Weekly Mon 07:30'] as const;
export const MODULES = ['Availability', 'Pricing & promotions', 'Search & shelf', 'Assortment', 'Catalogue quality'] as const;
export const OWNER_ROLES = ['Brand Manager', 'Category Manager', 'Data Operations', 'E-commerce Manager', 'Pricing Manager', 'Supply Planner'] as const;

export interface Threshold { value: number; unit: string; op: string; min: number; max: number; step: number; label: string }
export interface RuleDef {
  id: string;
  name: string;
  module: (typeof MODULES)[number];
  severity: Severity;
  owner: string;
  channel: string;
  frequency: string;
  scope: string;
  popUnit: string;
  evaluates: string;
  threshold?: Threshold;
  real: boolean;
  /** custom rule created in this session, evaluated like `base` */
  base?: string;
}
export interface Row { t: string; s: string; v: string }
export interface Evaluation { matches: number; population: number; rows: Row[] }
export interface Ctx { snapshots: Snapshot[]; latest: Snapshot[]; intervals: SelloutInterval[]; anchors: Anchor[]; platforms: string[]; cities: string[] }

const th = (value: number, unit: string, op: string, min: number, max: number, step: number, label: string): Threshold => ({ value, unit, op, min, max, step, label });

export const RULES: RuleDef[] = [
  { id: 'oos_streak', name: 'A listing is out of stock for consecutive captures', module: 'Availability', severity: 'critical', owner: 'Supply Planner', channel: 'Email + Slack', frequency: 'Every capture', scope: 'Listing', popUnit: 'listings', real: true, evaluates: 'Counts consecutive latest captures in which a listed product is out of stock at a store.', threshold: th(3, 'captures', '≥', 1, 9, 1, 'Out of stock for at least') },
  { id: 'buyable_share', name: 'Buyable share in a city on a platform falls below a floor', module: 'Availability', severity: 'critical', owner: 'E-commerce Manager', channel: 'Email + Slack', frequency: 'Every capture', scope: 'City × platform', popUnit: 'city × platform cells', real: true, evaluates: 'Buyable listings over listed listings per city and platform. Cells under five listings are not evaluated.', threshold: th(85, '%', '<', 50, 99, 1, 'Buyable share below') },
  { id: 'listing_disappears', name: 'A listing that was on the shelf disappears', module: 'Availability', severity: 'high', owner: 'E-commerce Manager', channel: 'Email + in-app', frequency: 'Every capture', scope: 'Listing', popUnit: 'listings', real: true, evaluates: 'A product that was listed in an earlier capture in this window is now not listed.' },
  { id: 'sellout_swing', name: 'Estimated sell-out swings day on day', module: 'Availability', severity: 'medium', owner: 'Supply Planner', channel: 'Daily digest email', frequency: 'Daily 07:30', scope: 'City × platform', popUnit: 'city × platform cells', real: true, evaluates: 'Estimated units in the last 24 h against the 24 h before, per city and platform. Estimates are a lower bound.', threshold: th(20, '%', '≥', 5, 80, 5, 'Swing of at least') },
  { id: 'deep_discount', name: 'A listing is discounted deeper than a limit off MRP', module: 'Pricing & promotions', severity: 'high', owner: 'Category Manager', channel: 'Email + in-app', frequency: 'Every capture', scope: 'Listing', popUnit: 'listings', real: true, evaluates: 'Discount is calculated from MRP and selling price on the latest capture, never read from a feed.', threshold: th(20, '%', '>', 5, 60, 1, 'Discount deeper than') },
  { id: 'price_spread', name: 'The same pack sells apart across cities', module: 'Pricing & promotions', severity: 'medium', owner: 'Pricing Manager', channel: 'Daily digest email', frequency: 'Daily 07:30', scope: 'Product × cities', popUnit: 'products in 2+ cities', real: true, evaluates: 'Highest against lowest selling price of the same pack across the cities in scope.', threshold: th(5, '%', '≥', 1, 40, 1, 'Gap of at least') },
  { id: 'assortment_depth', name: 'A platform carries too little of the range in a city', module: 'Assortment', severity: 'medium', owner: 'E-commerce Manager', channel: 'Weekly digest email', frequency: 'Weekly Mon 07:30', scope: 'City × platform', popUnit: 'city × platform cells', real: true, evaluates: 'Listed products over the Paper Boat range tracked in that city and platform.', threshold: th(90, '%', '<', 40, 100, 5, 'Range carried below') },
  { id: 'mrp_mismatch', name: "A listing's MRP differs between cities", module: 'Catalogue quality', severity: 'high', owner: 'Data Operations', channel: 'Email + in-app', frequency: 'Every capture', scope: 'Product × cities', popUnit: 'products in 2+ cities', real: true, evaluates: 'The same pack carries different MRP in different cities on the latest capture.', threshold: th(5, '%', '>', 1, 30, 1, 'MRP differs by more than') },
  { id: 'shelf_absent', name: 'A category shelf returns no Paper Boat result', module: 'Search & shelf', severity: 'high', owner: 'Category Manager', channel: 'Email + in-app', frequency: 'Every capture', scope: 'Keyword × city × platform', popUnit: 'category shelves', real: false, evaluates: 'Search shelves for category keywords with zero Paper Boat results (search feed not connected yet).' },
  { id: 'rival_undercut', name: 'A juice rival undercuts us per 100 ml', module: 'Pricing & promotions', severity: 'high', owner: 'Pricing Manager', channel: 'Email + in-app', frequency: 'Every capture', scope: 'Rival listing', popUnit: 'rival listings', real: false, evaluates: 'Rival price per 100 ml against Paper Boat on the same shelf (competitor feed not connected yet).', threshold: th(25, '%', '>', 5, 60, 5, 'Undercut by more than') },
  { id: 'rank_slip', name: 'Paper Boat is on the shelf but outside the top organic slots', module: 'Search & shelf', severity: 'medium', owner: 'Category Manager', channel: 'Daily digest email', frequency: 'Daily 07:30', scope: 'Keyword × city × platform', popUnit: 'category shelves', real: false, evaluates: 'Best organic rank beyond a limit (search feed not connected yet).', threshold: th(10, 'rank', '>', 3, 30, 1, 'Best rank worse than') },
  { id: 'peer_promo_deeper', name: 'A rival discounts deeper than us on a platform', module: 'Pricing & promotions', severity: 'medium', owner: 'Brand Manager', channel: 'Weekly digest email', frequency: 'Weekly Mon 07:30', scope: 'Brand × platform', popUnit: 'brand × platform cells', real: false, evaluates: 'Rival average discount minus Paper Boat average discount (competitor feed not connected yet).', threshold: th(10, 'pts', '>', 3, 30, 1, 'Deeper by more than') },
  { id: 'rating_low', name: 'A listing is rated below a floor', module: 'Catalogue quality', severity: 'medium', owner: 'Brand Manager', channel: 'Weekly digest email', frequency: 'Weekly Mon 07:30', scope: 'Listing', popUnit: 'listings', real: false, evaluates: 'Average listing rating (ratings feed not connected yet).', threshold: th(4.2, 'stars', '<', 3, 4.8, 0.1, 'Rated below') },
  { id: 'rival_above', name: 'A rival outranks us on many shared shelves', module: 'Search & shelf', severity: 'medium', owner: 'Brand Manager', channel: 'Weekly digest email', frequency: 'Weekly Mon 07:30', scope: 'Brand', popUnit: 'rival brands', real: false, evaluates: 'Share of shared shelves where the rival ranks above Paper Boat (search feed not connected yet).', threshold: th(20, '%', '>', 5, 60, 5, 'Outranks on more than') },
];

const byListing = (snaps: Snapshot[]) => {
  const m = new Map<string, Snapshot[]>();
  snaps.forEach((s) => (m.get(listingKey(s)) ?? m.set(listingKey(s), []).get(listingKey(s))!).push(s));
  m.forEach((g) => g.sort((a, b) => (a.scraped_at < b.scraped_at ? -1 : 1)));
  return m;
};
const groupBy = <T,>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, T[]>();
  rows.forEach((r) => (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r));
  return m;
};
const cmp = (op: string, a: number, b: number) => (op === '<' ? a < b : op === '>' ? a > b : op === '≥' ? a >= b : a <= b);
const crossCity = (latest: Snapshot[]) => groupBy(latest.filter((s) => s.availability !== 'not_listed' && s.selling_price), (s) => `${s.platform}|${s.product_id}`);

const REAL: Record<string, (c: Ctx, v: number) => Evaluation> = {
  oos_streak: (c, v) => {
    const rows: Row[] = [];
    let pop = 0;
    byListing(c.snapshots).forEach((g) => {
      const last = g[g.length - 1];
      if (last.availability === 'not_listed') return;
      pop++;
      let streak = 0;
      for (let i = g.length - 1; i >= 0 && g[i].availability === 'out_of_stock'; i--) streak++;
      if (streak >= v) rows.push({ t: productLabel(last), s: `${platformLabel(last.platform)} · ${last.city}`, v: `out of stock for ${streak} captures` });
    });
    return { matches: rows.length, population: pop, rows };
  },
  buyable_share: (c, v) => {
    const rows: Row[] = [];
    let pop = 0;
    groupBy(c.latest.filter((s) => s.availability !== 'not_listed'), (s) => `${s.platform}|${s.city}`).forEach((g, k) => {
      if (g.length < 5) return;
      pop++;
      const share = round1((g.filter((s) => s.availability === 'available').length / g.length) * 100);
      if (share < v) { const [p, city] = k.split('|'); rows.push({ t: `${platformLabel(p)} · ${city}`, s: `${g.length} listed listings`, v: `${share}% buyable` }); }
    });
    return { matches: rows.length, population: pop, rows };
  },
  listing_disappears: (c) => {
    const rows: Row[] = [];
    let pop = 0;
    byListing(c.snapshots).forEach((g) => {
      pop++;
      const last = g[g.length - 1];
      if (last.availability === 'not_listed' && g.some((s) => s.availability !== 'not_listed')) rows.push({ t: productLabel(g.find((s) => s.availability !== 'not_listed') ?? last), s: `${platformLabel(last.platform)} · ${last.city}`, v: 'listed earlier, not listed now' });
    });
    return { matches: rows.length, population: pop, rows };
  },
  sellout_swing: (c, v) => {
    const rows: Row[] = [];
    let pop = 0;
    groupBy(c.intervals, (r) => `${r.platform}|${r.city}`).forEach((g, k) => {
      pop++;
      const end = Math.max(...g.map((r) => Date.parse(r.to)));
      const cur = g.filter((r) => Date.parse(r.to) > end - 86400_000).reduce((a, r) => a + r.units, 0);
      const prior = g.filter((r) => Date.parse(r.to) <= end - 86400_000 && Date.parse(r.to) > end - 2 * 86400_000).reduce((a, r) => a + r.units, 0);
      if (prior < 20) return;
      const ch = Math.round(((cur - prior) / prior) * 100);
      if (Math.abs(ch) >= v) { const [p, city] = k.split('|'); rows.push({ t: `${platformLabel(p)} · ${city}`, s: `${cur} est. units vs ${prior} the day before`, v: `${ch > 0 ? '+' : ''}${ch}%` }); }
    });
    return { matches: rows.length, population: pop, rows };
  },
  deep_discount: (c, v) => {
    const listed = c.latest.filter((s) => s.availability !== 'not_listed' && s.mrp);
    const rows = listed.filter((s) => discountPct(s.mrp, s.selling_price) > v).map((s) => ({ t: productLabel(s), s: `${platformLabel(s.platform)} · ${s.city}`, v: `${discountPct(s.mrp, s.selling_price)}% off · ₹${s.selling_price} vs MRP ₹${s.mrp}` }));
    return { matches: rows.length, population: listed.length, rows };
  },
  price_spread: (c, v) => {
    const rows: Row[] = [];
    let pop = 0;
    crossCity(c.latest).forEach((g) => {
      if (new Set(g.map((s) => s.city)).size < 2) return;
      pop++;
      const lo = g.reduce((a, b) => ((a.selling_price as number) <= (b.selling_price as number) ? a : b));
      const hi = g.reduce((a, b) => ((a.selling_price as number) >= (b.selling_price as number) ? a : b));
      const gap = round1((((hi.selling_price as number) - (lo.selling_price as number)) / (lo.selling_price as number)) * 100);
      if (gap >= v) rows.push({ t: productLabel(hi), s: `${platformLabel(hi.platform)} · ${lo.city} ₹${lo.selling_price} / ${hi.city} ₹${hi.selling_price}`, v: `+${gap}%` });
    });
    return { matches: rows.length, population: pop, rows };
  },
  assortment_depth: (c, v) => {
    const rows: Row[] = [];
    let pop = 0;
    groupBy(c.latest, (s) => `${s.platform}|${s.city}`).forEach((g, k) => {
      pop++;
      const share = round1((g.filter((s) => s.availability !== 'not_listed').length / g.length) * 100);
      if (share < v) { const [p, city] = k.split('|'); rows.push({ t: `${platformLabel(p)} · ${city}`, s: `${g.length} products tracked`, v: `${share}% carried` }); }
    });
    return { matches: rows.length, population: pop, rows };
  },
  mrp_mismatch: (c, v) => {
    const rows: Row[] = [];
    let pop = 0;
    crossCity(c.latest.filter((s) => s.mrp)).forEach((g) => {
      if (new Set(g.map((s) => s.city)).size < 2) return;
      pop++;
      const lo = Math.min(...g.map((s) => s.mrp as number));
      const hi = Math.max(...g.map((s) => s.mrp as number));
      const gap = round1(((hi - lo) / lo) * 100);
      if (gap > v) rows.push({ t: productLabel(g[0]), s: `${platformLabel(g[0].platform)} · MRP ₹${lo} to ₹${hi}`, v: `${gap}%` });
    });
    return { matches: rows.length, population: pop, rows };
  },
};

/** Seeded sample evaluation; responds to the threshold so editing it still does something sensible. */
function sampleEval(rule: RuleDef, c: Ctx, v: number | undefined): Evaluation {
  const r = rng(`${rule.id}|${c.platforms.join()}|${c.cities.join()}`);
  const pop = Math.max(8, intBetween(r, 40, 360) * Math.max(1, c.cities.length));
  const t0 = rule.threshold;
  const base = Math.round(pop * (0.06 + r() * 0.2));
  const f = t0 && v ? (t0.op === '<' ? v / t0.value : t0.value / v) : 1;
  const matches = Math.max(0, Math.min(pop, Math.round(base * f)));
  const rows: Row[] = Array.from({ length: Math.min(matches, 12) }, () => {
    const a = c.anchors.length ? pickOf(r, c.anchors) : undefined;
    const rival = pickOf(r, RIVALS);
    return { t: a?.label ?? 'Paper Boat range', s: `${a ? platformLabel(a.platform) : platformLabel(c.platforms[0] ?? '')} · ${a?.city ?? c.cities[0] ?? ''}`, v: rule.id === 'rating_low' ? `${(3.4 + r() * 0.7).toFixed(1)} stars` : rule.id.startsWith('rival') || rule.id.startsWith('peer') ? `${rival} · ${intBetween(r, 12, 40)}%` : rule.id === 'rank_slip' ? `best rank #${intBetween(r, 11, 26)}` : 'no Paper Boat result' };
  });
  return { matches, population: pop, rows };
}

export function evaluate(rule: RuleDef, c: Ctx, v: number | undefined): Evaluation {
  const key = rule.base ?? rule.id;
  const fn = REAL[key];
  return fn ? fn(c, v ?? rule.threshold?.value ?? 0) : sampleEval(rule, c, v);
}
