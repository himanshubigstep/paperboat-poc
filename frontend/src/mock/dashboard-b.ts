/**
 * SAMPLE data for the executive-dashboard tabs: Search & shelf, Network (delivery), Channels, Customer voice,
 * Forecasting and the sample rules on Anomalies. Everything here is a deterministic seeded generator in the
 * same shape as the reference data.js, restricted to the platforms / cities / product lines passed in, so it
 * keeps working when more platforms and cities are connected. No Math.random, no Date.now.
 */
import { CITIES, PLATFORMS } from '@/lib/config';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string) {
  let s = hash(seed);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (n: number) => Math.round(n * 10) / 10;
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

/** platform / city size factors (Blinkit Delhi ~ 1) so sample volumes scale with whatever is connected */
const platFactor = (p: string) => (p === 'blinkit' ? 1 : 0.55 + (hash(p) % 60) / 100);
const cityFactor = (c: string) => (CITIES.find((x) => x.id === c)?.stores ?? 120) / 170;

// ---------------------------------------------------------------- search & shelf
export type KeywordType = 'category' | 'occasion' | 'competitor_brand' | 'brand_self';
export const KEYWORDS: { keyword: string; type: KeywordType }[] = [
  { keyword: 'fruit juice', type: 'category' },
  { keyword: 'mango drink', type: 'category' },
  { keyword: 'iced tea', type: 'category' },
  { keyword: 'cold drink', type: 'category' },
  { keyword: 'energy drink', type: 'category' },
  { keyword: 'soft drink', type: 'category' },
  { keyword: 'coconut water', type: 'category' },
  { keyword: 'lemonade', type: 'category' },
  { keyword: 'prebiotic soda', type: 'category' },
  { keyword: 'aam panna', type: 'occasion' },
  { keyword: 'summer drinks', type: 'occasion' },
  { keyword: 'real juice', type: 'competitor_brand' },
  { keyword: 'coca cola', type: 'competitor_brand' },
  { keyword: 'paper boat', type: 'brand_self' },
];
const BRANDS: { brand: string; w: number }[] = [
  { brand: 'Brand not resolved', w: 17 }, { brand: 'Real', w: 9 }, { brand: 'Raw Pressery', w: 8 }, { brand: 'Maaza', w: 7 },
  { brand: 'Coca Cola', w: 6 }, { brand: 'Frooti', w: 5 }, { brand: 'B Natural', w: 5 }, { brand: 'Thums Up', w: 5 },
  { brand: 'Sprite', w: 4 }, { brand: 'Storia', w: 4 }, { brand: 'NOICE', w: 3 }, { brand: 'Slice', w: 3 }, { brand: 'Tropicana', w: 3 },
];
export const RANK_BANDS = ['Top 3', '4–10', '11–20', 'Beyond 20'] as const;

export interface ShelfRow {
  keyword: string;
  type: KeywordType;
  platform: string;
  city: string;
  total: number; // results returned
  pb: number; // Paper Boat results
  share: number; // pb / total, %
  bestRank: number | null; // best organic position of Paper Boat
  top10: Record<string, number>; // brand -> slots in the first ten results
  above: string[]; // brands ranked above Paper Boat's best result
}

export function searchShelf(platforms: string[], cities: string[]): ShelfRow[] {
  const rows: ShelfRow[] = [];
  for (const k of KEYWORDS)
    for (const p of platforms)
      for (const c of cities) {
        const r = rng(`shelf|${k.keyword}|${p}|${c}`);
        const total = Math.round((26 + r() * 70) * (k.type === 'competitor_brand' ? 1.3 : 1));
        const baseShare = { category: 0.07, occasion: 0.22, competitor_brand: 0.04, brand_self: 0.52 }[k.type];
        const absentChance = k.type === 'category' ? 0.22 : k.type === 'occasion' ? 0.08 : 0.02;
        const absent = r() < absentChance;
        const pb = absent ? 0 : Math.max(1, Math.round(total * baseShare * (0.5 + r())));
        const bestRank = pb ? (k.type === 'brand_self' ? 1 : 1 + Math.floor(Math.pow(r(), 1.8) * 28)) : null;
        const top10: Record<string, number> = {};
        const pbSlots = bestRank && bestRank <= 10 ? Math.min(10, 1 + Math.floor(r() * (k.type === 'brand_self' ? 8 : 3))) : 0;
        if (pbSlots) top10['Paper Boat'] = pbSlots;
        const wsum = BRANDS.reduce((a, b) => a + b.w, 0);
        for (let i = pbSlots; i < 10; i++) {
          let x = r() * wsum;
          const b = BRANDS.find((bb) => (x -= bb.w) < 0) ?? BRANDS[0];
          top10[b.brand] = (top10[b.brand] ?? 0) + 1;
        }
        const aboveCount = bestRank ? Math.min(4, Math.max(0, bestRank - 1)) : 0;
        const above: string[] = [];
        for (let i = 0; i < aboveCount; i++) above.push(pick(r, BRANDS.filter((b) => b.brand !== 'Brand not resolved')).brand);
        rows.push({ keyword: k.keyword, type: k.type, platform: p, city: c, total, pb, share: r1((pb / total) * 100), bestRank, top10, above });
      }
  return rows;
}

// ---------------------------------------------------------------- delivery promise
export interface SlaCell { platform: string; city: string; minutes: number }
export function slaCells(platforms: string[], cities: string[]): SlaCell[] {
  const base: Record<string, number> = { blinkit: 9, zepto: 10, swiggy: 12, bigbasket: 15, minutes: 11, now: 8, jiomart: 22, dmart: 28, firstclub: 17 };
  return platforms.flatMap((platform) =>
    cities.map((city) => {
      const r = rng(`sla|${platform}|${city}`);
      return { platform, city, minutes: Math.max(5, Math.round((base[platform] ?? 15) + (r() - 0.4) * 6)) };
    }),
  );
}

// ---------------------------------------------------------------- media
export interface AdRow { platform: string; spend_l: number; roas: number; cpu: number; sov_pct: number }
export function adSpend(platforms: string[]): AdRow[] {
  return platforms.map((platform) => {
    const r = rng(`ad|${platform}`);
    const spend = r1((6 + r() * 12) * platFactor(platform) * 1.2);
    return { platform, spend_l: spend, roas: r1(2.6 + r() * 1.6), cpu: r1(8 + r() * 6), sov_pct: Math.round(10 + r() * 14) };
  });
}

// ---------------------------------------------------------------- customer voice
export const THEMES = ['Taste', 'Freshness', 'Price / value', 'Too sweet', 'Pack leakage', 'Delivery damage'] as const;
export interface VoiceData {
  stars: { platform: string; star: string; count: number }[];
  themes: { theme: string; pct: number; kind: 'positive' | 'negative' }[];
  repeat: { week: string; platform: string; pct: number }[];
  mean: number;
  reviews: number;
  byLine: { line: string; rating: number; ratedListings: number; reviews: number; under: number }[];
  kpis: { positive: number; repeat90: number; newToBrand: number; escalations: number };
}
export function voice(platforms: string[], lines: { line: string; listings: number }[]): VoiceData {
  const stars: VoiceData['stars'] = [];
  let totalReviews = 0;
  let weighted = 0;
  platforms.forEach((p) => {
    const r = rng(`voice|${p}`);
    const n = Math.round((90000 + r() * 90000) * platFactor(p));
    const dist = [0.01, 0.02, 0.06, 0.28 + r() * 0.1, 0];
    dist[4] = 1 - dist[0] - dist[1] - dist[2] - dist[3];
    dist.forEach((d, i) => {
      const count = Math.round(n * d);
      stars.push({ platform: p, star: `${i + 1}★`, count });
      weighted += count * (i + 1);
      totalReviews += count;
    });
  });
  const mean = totalReviews ? Math.round((weighted / totalReviews) * 100) / 100 : 0;
  const rt = rng(`themes|${platforms.join()}`);
  const pos = [52, 6];
  const neg = [14, 12, 7, 9];
  const themes = THEMES.map((theme, i) => ({ theme, pct: Math.round((i < 2 ? pos[i] : neg[i - 2]) * (0.9 + rt() * 0.2)), kind: (i < 2 ? 'positive' : 'negative') as 'positive' | 'negative' }));
  const repeat: VoiceData['repeat'] = [];
  platforms.forEach((p) => {
    const r = rng(`repeat|${p}`);
    let v = 100;
    ['Wk 1', 'Wk 2', 'Wk 4', 'Wk 8', 'Wk 12'].forEach((week, i) => {
      v = i === 0 ? 100 : Math.round(v * (0.66 + r() * 0.2));
      repeat.push({ week, platform: p, pct: v });
    });
  });
  const lowLine = 4.28;
  const byLine = lines.map((l) => {
    const r = rng(`line|${l.line}`);
    const rating = Math.round((4.2 + r() * 0.45) * 100) / 100;
    return { line: l.line, rating, ratedListings: l.listings * Math.max(1, platforms.length), reviews: Math.round((8000 + r() * 90000) * l.listings), under: rating < lowLine ? Math.max(1, Math.round(l.listings / 2)) : 0 };
  }).sort((a, b) => b.reviews - a.reviews);
  return { stars, themes, repeat, mean, reviews: totalReviews, byLine, kpis: { positive: 81, repeat90: 38, newToBrand: Math.round(21400 * platforms.length * 0.9), escalations: 4 } };
}

// ---------------------------------------------------------------- forecast
export interface FcWeek { week: string; actual?: number; p10?: number; p50?: number; p90?: number }
export interface ForecastData {
  weeks: FcWeek[];
  drivers: { driver: string; impact: number }[];
  accuracy: { wape: number; baseline: number; bias: number };
  table: { line: string; byCity: Record<string, number>; total: number; growth: number }[];
  last4: number;
  next4: number;
  next8: number;
}
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export function forecast(platforms: string[], cities: string[], lines: string[], capturedDay: string): ForecastData {
  const scale = platforms.reduce((a, p) => a + platFactor(p), 0) * cities.reduce((a, c) => a + cityFactor(c), 0);
  const base = 9000 * scale;
  const r = rng(`fc|${platforms.join()}|${cities.join()}`);
  const weeks: FcWeek[] = [];
  const hist = 6;
  for (let i = -hist + 1; i <= 0; i++) {
    const trend = 1 + 0.012 * (i + hist);
    weeks.push({ week: addDays(capturedDay, i * 7), actual: Math.round(base * trend * (0.95 + r() * 0.1)) });
  }
  const last = weeks[weeks.length - 1].actual ?? base;
  let level = last;
  for (let i = 1; i <= 8; i++) {
    level = level * (1.01 + (i === 4 || i === 5 ? 0.05 : 0) + (r() - 0.5) * 0.01);
    const w = 0.06 + i * 0.006;
    weeks.push({ week: addDays(capturedDay, i * 7), p50: Math.round(level), p10: Math.round(level * (1 - w)), p90: Math.round(level * (1 + w)) });
  }
  const f = weeks.filter((w) => w.p50 !== undefined);
  const histW = weeks.filter((w) => w.actual !== undefined);
  const next4 = f.slice(0, 4).reduce((a, w) => a + (w.p50 ?? 0), 0);
  const last4 = histW.slice(-4).reduce((a, w) => a + (w.actual ?? 0), 0);
  const next8 = f.reduce((a, w) => a + (w.p50 ?? 0), 0);
  const drivers = [
    { driver: 'Baseline trend', impact: 3.1 },
    { driver: `Temperature (${cities.join(', ')})`, impact: 4.2 },
    { driver: 'Festival window (Navratri)', impact: 6.0 },
    { driver: 'Stock-outs on key listings', impact: -2.8 },
    { driver: 'Competitor promo depth', impact: -1.6 },
  ];
  const w = lines.map((l) => 0.5 + rng(`fcl|${l}`)());
  const wTotal = w.reduce((x, y) => x + y, 0) || 1;
  const cTotal = cities.reduce((x, c) => x + cityFactor(c), 0) || 1;
  const table = lines.map((line, i) => {
    const growth = r1(-1 + rng(`fcg|${line}`)() * 11);
    const byCity: Record<string, number> = {};
    let total = 0;
    cities.forEach((c) => {
      const v = Math.round(next4 * (w[i] / wTotal) * (cityFactor(c) / cTotal));
      byCity[c] = v;
      total += v;
    });
    return { line, byCity, total, growth };
  }).sort((a, b) => b.total - a.total);
  return { weeks, drivers, accuracy: { wape: 11.4, baseline: 17.8, bias: -1.9 }, table, last4, next4, next8 };
}

// ---------------------------------------------------------------- network extras
export interface BeyondCity { city: string; stores: number; platforms: { platform: string; n: number }[] }
/** cities on the network that are not yet connected -> "shelf not yet observed" */
export function beyondCities(): BeyondCity[] {
  return CITIES.filter((c) => !c.connected).map((c) => ({
    city: c.label,
    stores: c.stores,
    platforms: PLATFORMS.filter((p) => p.id !== 'dmart' && p.id !== 'firstclub')
      .map((p) => ({ platform: p.id, n: Math.round(c.stores * (0.15 + rng(`bc|${c.id}|${p.id}`)() * 0.55) * (p.id === 'blinkit' ? 1.1 : 0.8)) }))
      .sort((a, b) => b.n - a.n),
  }));
}

// ---------------------------------------------------------------- sample alert rules (non-capture)
export interface SampleRule {
  id: string;
  name: string;
  module: string;
  scope: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  owner: string;
  threshold: string;
  evaluates: string;
  matches: number;
  population: number;
  examples: { t: string; s: string; v: string }[];
  byPlatform: Record<string, number>;
  byCity: Record<string, number>;
}
export function sampleRules(platforms: string[], cities: string[], shelf: ShelfRow[], ads: AdRow[], sla: SlaCell[], realBuyable: Record<string, number>): SampleRule[] {
  const split = (total: number, keys: string[], seed: string) => {
    const o: Record<string, number> = {};
    let left = total;
    keys.forEach((k, i) => {
      const v = i === keys.length - 1 ? left : Math.min(left, Math.round((total / keys.length) * (0.6 + rng(`${seed}|${k}`)() * 0.8)));
      o[k] = v;
      left -= v;
    });
    return o;
  };
  const cat = shelf.filter((s) => s.type === 'category' || s.type === 'occasion');
  const absent = cat.filter((s) => s.pb === 0);
  const slip = cat.filter((s) => s.bestRank !== null && s.bestRank > 10);
  const byKey = <T,>(rows: T[], f: (s: T) => string) => rows.reduce<Record<string, number>>((a, s) => ((a[f(s)] = (a[f(s)] ?? 0) + 1), a), {});
  const ex = (rows: ShelfRow[], v: (s: ShelfRow) => string) => rows.slice(0, 3).map((s) => ({ t: `“${s.keyword}”`, s: `${platformName(s.platform)} · ${s.city}`, v: v(s) }));
  const platformName = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;
  const out: SampleRule[] = [
    { id: 'shelf_absent', name: 'Paper Boat returns no result on a category shelf', module: 'Search', scope: 'Keyword × city × platform', severity: 'high', owner: 'Brand / Search lead', threshold: 'No Paper Boat result', evaluates: 'Looks at every category and occasion keyword searched in a city on a platform and checks whether any of the results is Paper Boat.', matches: absent.length, population: cat.length, examples: ex(absent, (s) => `${s.total} results, none Paper Boat`), byPlatform: byKey(absent, (s) => s.platform), byCity: byKey(absent, (s) => s.city) },
    { id: 'rank_slip', name: 'Best organic rank slips past the tenth slot', module: 'Search', scope: 'Keyword × city × platform', severity: 'medium', owner: 'Brand / Search lead', threshold: 'Past slot 10', evaluates: 'Takes the best organic position Paper Boat reaches on a shelf and flags shelves where it sits beyond the first ten results.', matches: slip.length, population: cat.filter((s) => s.pb > 0).length, examples: ex(slip, (s) => `Best rank #${s.bestRank}`), byPlatform: byKey(slip, (s) => s.platform), byCity: byKey(slip, (s) => s.city) },
  ];
  const weak = ads.filter((a) => (realBuyable[a.platform] ?? 100) < 95);
  const weakTotal = weak.reduce((a, r) => a + r.spend_l, 0);
  if (weak.length)
    out.push({ id: 'media_weak', name: 'Media spend running on listings that are not buyable', module: 'Media', scope: 'Listing', severity: 'high', owner: 'Media / Performance marketing', threshold: 'Buyable < 95%', evaluates: 'Compares the platform media budget with the share of its Paper Boat listings that are actually buyable at capture.', matches: weak.length, population: ads.length, examples: weak.slice(0, 3).map((a) => ({ t: platformName(a.platform), s: `₹${a.spend_l} L / 30 d`, v: `Buyable ${realBuyable[a.platform] ?? 100}%` })), byPlatform: Object.fromEntries(weak.map((a) => [a.platform, 1])), byCity: split(weak.length, cities, 'mw') });
  const slow = sla.filter((s) => s.minutes >= 20);
  if (slow.length)
    out.push({ id: 'sla_slow', name: 'Promised delivery slower than 20 minutes', module: 'Network', scope: 'City × platform', severity: 'medium', owner: 'Regional ops', threshold: '≥ 20 min', evaluates: 'Reads the delivery minutes shown on the listing for each platform and city.', matches: slow.length, population: sla.length, examples: slow.slice(0, 3).map((s) => ({ t: platformName(s.platform), s: s.city, v: `${s.minutes} min` })), byPlatform: byKey(slow, (s) => s.platform), byCity: byKey(slow, (s) => s.city) });
  const rr = rng(`rules|${platforms.join()}|${cities.join()}`);
  const ratingDrop = Math.round(rr() * 2);
  if (ratingDrop)
    out.push({ id: 'rating_low', name: 'A product line rates 0.20 below the brand mean', module: 'Customer', scope: 'Listing', severity: 'medium', owner: 'Quality & CX', threshold: '< 4.28 ★', evaluates: 'Compares each line’s published listing rating with the brand mean.', matches: ratingDrop, population: 12, examples: [{ t: 'Zero Fizz', s: platformName(platforms[0]), v: '4.21 ★' }], byPlatform: split(ratingDrop, platforms, 'rd'), byCity: {} });
  return out;
}
