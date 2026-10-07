/**
 * Dummy data. Shape follows the reference product's data pattern
 * (meta, sos_by_keyword, availability_states, availability_matrix, oos_items, price_dispersion,
 * discount_bands, alert_rules, ...) but is limited to Blinkit · Delhi · Mumbai.
 * Replaced by the backend API (see src/lib/api.ts) — keep field names aligned with
 * .claude/rules/data-contract.md.
 */
import type { City, DayPoint, Listing, Meta, Product, Recommendation, Signal, KeywordType, Availability } from '@/lib/types';

// ---------- deterministic RNG so SSR and client agree ----------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261007);
const between = (a: number, b: number) => a + (b - a) * rand();
const r1 = (n: number) => Math.round(n * 10) / 10;

export const CITIES: City[] = ['Delhi', 'Mumbai'];
export const CAPTURED_AT = '2026-10-07T08:35:00Z'; // 14:05 IST

export const meta: Meta = {
  platform: 'Blinkit',
  captured_at: CAPTURED_AT,
  captures_per_day: 3,
  cities: CITIES,
  products: 14,
  keywords: 8,
  stores: { Delhi: 164, Mumbai: 186 },
  pincodes: { Delhi: '110005', Mumbai: '400050' },
  runs_24h: { ok: 5, failed: 0, blocked: 1 },
};

// ---------- products (ids taken from the first real Blinkit test scrape) ----------
export const products: Product[] = [
  { product_id: '306', name: 'Jamun Fruit Juice (Zero Added Sugar)', line: 'Swing Zero', pack_size: '200 ml', category: 'Fruit Juice', shelf_life_days: 242, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '5440', name: 'Aamras Mango Drink', line: 'Aamras', pack_size: '215 ml', category: 'Mango Drinks', shelf_life_days: 240, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '130163', name: 'Aamras Mango Drink', line: 'Aamras', pack_size: '1 ltr', category: 'Mango Drinks', shelf_life_days: 240, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '204910', name: 'Anar Pomegranate Juice', line: 'Swing', pack_size: '215 ml', category: 'Fruit Juice', shelf_life_days: 241, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '221310', name: 'Chilli Guava Zero Added Sugar', line: 'Swing Zero', pack_size: '215 ml', category: 'Fruit Juice', shelf_life_days: 240, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '243557', name: 'Aam Panna Zero Added Sugar (2 pack)', line: 'Aam Panna', pack_size: '2 x 200 ml', category: 'Mango Drinks', shelf_life_days: 244, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '373342', name: 'Coconut Water', line: 'Coconut Water', pack_size: '200 ml', category: 'Coconut Water', shelf_life_days: 270, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '410021', name: 'Mango Passion Sparkling Drink', line: 'Zero Fizz', pack_size: '300 ml', category: 'Sparkling Drinks', shelf_life_days: 180, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '410022', name: 'Lychee Sparkling Drink', line: 'Zero Fizz', pack_size: '300 ml', category: 'Sparkling Drinks', shelf_life_days: 180, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '410023', name: 'Tonic Water', line: 'Mixers', pack_size: '300 ml', category: 'Tonic Water', shelf_life_days: 548, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '410024', name: 'Jaljeera Sparkling Drink', line: 'Zero Fizz', pack_size: '600 ml', category: 'Sparkling Drinks', shelf_life_days: 180, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '410025', name: 'Lively Orange Juice', line: 'Swing', pack_size: '1.2 ltr', category: 'Fruit Juice', shelf_life_days: 240, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '410026', name: 'Kokum Cooler', line: 'Swing', pack_size: '250 ml', category: 'Fruit Juice', shelf_life_days: 242, marketer: 'Hector Beverages Pvt. Ltd.' },
  { product_id: '410027', name: 'Sweet Lime Juice', line: 'Swing', pack_size: '250 ml', category: 'Fruit Juice', shelf_life_days: 242, marketer: 'Hector Beverages Pvt. Ltd.' },
];

const MRP_BASE: Record<string, number> = { '306': 55, '5440': 40, '130163': 110, '204910': 50, '221310': 40, '243557': 80, '373342': 50, '410021': 60, '410022': 60, '410023': 70, '410024': 120, '410025': 140, '410026': 40, '410027': 40 };

// ---------- time axis: last 14 days ----------
export const DAYS: string[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 7 - (13 - i)));
  return d.toISOString().slice(0, 10);
});

// ---------- listings (latest capture, product x city) ----------
export const listings: Listing[] = [];
for (const c of CITIES) {
  for (const p of products) {
    const mrp = MRP_BASE[p.product_id] + (c === 'Mumbai' && rand() > 0.7 ? 5 : 0);
    const discRoll = rand();
    const price = discRoll > 0.6 ? Math.round(mrp * (1 - between(0.02, 0.12))) : mrp;
    const a = rand();
    let availability: Availability = 'available';
    if (p.product_id === '130163' && c === 'Delhi') availability = 'out_of_stock'; // known stock-out
    else if (p.product_id === '410023' && c === 'Mumbai') availability = 'not_listed';
    else if (a > 0.92) availability = 'out_of_stock';
    else if (a > 0.97) availability = 'not_listed';
    const stock = availability === 'available' ? Math.round(between(1, 12)) : 0;
    listings.push({
      key: `${p.product_id}-${c}`,
      product_id: p.product_id,
      name: p.name,
      line: p.line,
      pack_size: p.pack_size,
      category: p.category,
      city: c,
      store_id: c === 'Delhi' ? '36383' : '34679',
      mrp: availability === 'not_listed' ? 0 : mrp,
      selling_price: availability === 'not_listed' ? 0 : price,
      discount_pct: availability === 'not_listed' ? 0 : r1(((mrp - price) / mrp) * 100),
      availability,
      stock,
      est_units_7d: availability === 'not_listed' ? 0 : Math.round(between(18, 140)),
      best_rank: availability === 'not_listed' ? null : Math.round(between(1, 18)),
      scraped_at: CAPTURED_AT,
      url: `https://blinkit.com/prn/x/prid/${p.product_id}`,
    });
  }
}

// ---------- availability ----------
export const availability_states: Record<City, { available: number; out_of_stock: number; not_listed: number; total: number; pct: number }> = {
  Delhi: { available: 0, out_of_stock: 0, not_listed: 0, total: 0, pct: 0 },
  Mumbai: { available: 0, out_of_stock: 0, not_listed: 0, total: 0, pct: 0 },
};
for (const l of listings) {
  const s = availability_states[l.city];
  s[l.availability] += 1;
  s.total += 1;
}
for (const c of CITIES) availability_states[c].pct = Math.round((availability_states[c].available / availability_states[c].total) * 100);

export const AREAS: Record<City, string[]> = {
  Delhi: ['Karol Bagh', 'Dev Nagar', 'Rohini', 'Saket', 'Dwarka', 'Lajpat Nagar', 'Janakpuri', 'Mayur Vihar'],
  Mumbai: ['Bandra West', 'Andheri East', 'Powai', 'Dadar', 'Borivali', 'Lower Parel', 'Thane West', 'Chembur'],
};

/** buyable % per product x dark-store area (rows = products, cols = areas) */
export const availability_matrix: Record<City, { areas: string[]; rows: { product: string; cells: number[] }[] }> = {
  Delhi: { areas: AREAS.Delhi, rows: [] },
  Mumbai: { areas: AREAS.Mumbai, rows: [] },
};
for (const c of CITIES) {
  for (const p of products.slice(0, 10)) {
    availability_matrix[c].rows.push({
      product: `${p.name} · ${p.pack_size}`,
      cells: AREAS[c].map(() => {
        const r = rand();
        return r > 0.9 ? 0 : r > 0.8 ? Math.round(between(40, 70)) : r > 0.65 ? Math.round(between(80, 95)) : 100;
      }),
    });
  }
}
availability_matrix.Delhi.rows[2].cells = AREAS.Delhi.map(() => 0); // the known Delhi stock-out

export const availability_trend: DayPoint[] = [];
for (const c of CITIES) {
  let v = c === 'Delhi' ? 90 : 93;
  for (const d of DAYS) {
    v = Math.min(100, Math.max(78, v + between(-3, 3)));
    availability_trend.push({ date: d, city: c, value: r1(v) });
  }
}
availability_trend.find((p) => p.city === 'Delhi' && p.date === DAYS[DAYS.length - 1])!.value = r1((availability_states.Delhi.available / availability_states.Delhi.total) * 100);

export const oos_items = listings
  .filter((l) => l.availability !== 'available')
  .map((l) => ({
    city: l.city,
    name: l.name,
    pack_size: l.pack_size,
    product_id: l.product_id,
    state: l.availability,
    since: l.availability === 'out_of_stock' ? `${Math.round(between(1, 6))} captures` : '—',
  }));

// ---------- sell-out (ESTIMATE from stock deltas) ----------
export const est_sellout: DayPoint[] = [];
export const est_revenue: DayPoint[] = [];
for (const c of CITIES) {
  let u = c === 'Delhi' ? 420 : 520;
  for (const d of DAYS) {
    u = Math.max(260, u + between(-45, 55));
    est_sellout.push({ date: d, city: c, value: Math.round(u) });
    est_revenue.push({ date: d, city: c, value: Math.round(u * 54) });
  }
}

// ---------- price & discount ----------
export const price_trend: { date: string; city: City; avg_price: number; avg_mrp: number; avg_discount: number }[] = [];
for (const c of CITIES) {
  let disc = c === 'Delhi' ? 6.5 : 5.2;
  for (const d of DAYS) {
    disc = Math.max(1, disc + between(-0.8, 0.9));
    const mrp = 71 + (c === 'Mumbai' ? 2 : 0);
    price_trend.push({ date: d, city: c, avg_mrp: mrp, avg_price: r1(mrp * (1 - disc / 100)), avg_discount: r1(disc) });
  }
}
export const discount_bands = {
  bands: ['At MRP', 'Up to 5%', '5–10%', '10–20%', 'Over 20%'],
  Delhi: [6, 3, 3, 2, 0],
  Mumbai: [8, 2, 2, 1, 1],
};
export const price_dispersion = products.slice(0, 8).map((p) => {
  const d = listings.find((l) => l.product_id === p.product_id && l.city === 'Delhi')!;
  const m = listings.find((l) => l.product_id === p.product_id && l.city === 'Mumbai')!;
  return { product: `${p.name} · ${p.pack_size}`, Delhi: d.selling_price, Mumbai: m.selling_price, gap_pct: d.selling_price ? r1(((m.selling_price - d.selling_price) / d.selling_price) * 100) : 0 };
});

// ---------- search rank / share of search ----------
export const keywords: { keyword: string; type: KeywordType }[] = [
  { keyword: 'paper boat', type: 'brand_self' },
  { keyword: 'paper boat aamras', type: 'brand_self' },
  { keyword: 'aam panna', type: 'occasion' },
  { keyword: 'mango drink', type: 'category' },
  { keyword: 'fruit juice', type: 'category' },
  { keyword: 'coconut water', type: 'category' },
  { keyword: 'real juice', type: 'competitor_brand' },
  { keyword: 'tropicana', type: 'competitor_brand' },
];
export const sos_by_keyword = keywords.map((k) => {
  const total = Math.round(between(180, 420));
  const base = k.type === 'brand_self' ? between(0.55, 0.72) : k.type === 'occasion' ? 0.24 : k.type === 'category' ? between(0.1, 0.16) : between(0.03, 0.07);
  const pb = Math.round(total * base);
  return { ...k, pb, total, share: r1((pb / total) * 100) };
});
export const search_rank = keywords.flatMap((k, i) =>
  CITIES.map((c) => {
    const best = k.type === 'brand_self' ? Math.round(between(1, 2)) : k.type === 'competitor_brand' ? Math.round(between(6, 14)) : Math.round(between(2, 9));
    const prev = Math.max(1, best + Math.round(between(-2, 2)));
    return {
      key: `${k.keyword}-${c}`,
      keyword: k.keyword,
      type: k.type,
      city: c,
      rank: best,
      prev_rank: prev,
      is_sponsored: k.type !== 'brand_self' && rand() > 0.55,
      share: r1(between(k.type === 'brand_self' ? 50 : 4, k.type === 'brand_self' ? 75 : 26)),
      slots_top10: Math.round(between(1, k.type === 'brand_self' ? 6 : 3)) + (i % 2),
    };
  }),
);
export const rank_trend: { date: string; city: City; value: number }[] = [];
for (const c of CITIES) {
  let v = c === 'Delhi' ? 6.2 : 5.1;
  for (const d of DAYS) {
    v = Math.max(2, Math.min(12, v + between(-0.6, 0.6)));
    rank_trend.push({ date: d, city: c, value: r1(v) });
  }
}

// ---------- city compare ----------
export const city_compare = (() => {
  const row = (c: City) => {
    const ls = listings.filter((l) => l.city === c && l.availability !== 'not_listed');
    const avg = (f: (l: (typeof ls)[number]) => number) => r1(ls.reduce((a, l) => a + f(l), 0) / ls.length);
    const last = est_sellout.filter((p) => p.city === c).slice(-7).reduce((a, p) => a + p.value, 0);
    return {
      city: c,
      stores: meta.stores[c],
      listed: ls.length,
      availability_pct: availability_states[c].pct,
      avg_price: avg((l) => l.selling_price),
      avg_discount: avg((l) => l.discount_pct),
      avg_rank: avg((l) => l.best_rank ?? 0),
      sos_brand: r1(sos_by_keyword.slice(0, 2).reduce((a, k) => a + k.share, 0) / 2 + (c === 'Mumbai' ? 3 : 0)),
      est_units_7d: last,
    };
  };
  return CITIES.map(row);
})();

// ---------- signals / recommendations ----------
const T = (h: number) => new Date(Date.parse(CAPTURED_AT) - h * 3600_000).toISOString();
export const signals: Signal[] = [
  { id: 'sig-01', severity: 'critical', type: 'availability', title: 'Aamras 1 ltr is out of stock across every Delhi store', detail: 'Out of stock for 4 consecutive captures in all 8 observed Delhi dark stores. Mumbai is unaffected.', city: 'Delhi', product: 'Aamras Mango Drink · 1 ltr', metric: 'Buyable', delta: '100% → 0%', confidence: 96, detected_at: T(3), rule: 'OOS ≥ 3 consecutive captures', free_or_paid: 'free' },
  { id: 'sig-02', severity: 'high', type: 'search', title: '"mango drink" rank slipped from #3 to #7 in Mumbai', detail: 'A rival moved into top-3 with a sponsored slot; Paper Boat position is organic.', city: 'Mumbai', product: 'Aamras Mango Drink · 215 ml', metric: 'Best rank', delta: '#3 → #7', confidence: 88, detected_at: T(6), rule: 'Rank drop ≥ 3 on tracked keyword', free_or_paid: 'paid' },
  { id: 'sig-03', severity: 'high', type: 'price', title: 'Delhi selling above MRP-parity vs Mumbai on Coconut Water', detail: 'Delhi sells at ₹50 (no discount) while Mumbai shows ₹47.', city: 'Both', product: 'Coconut Water · 200 ml', metric: 'Price gap', delta: '+6.4%', confidence: 82, detected_at: T(8), rule: 'City price gap > 5%', free_or_paid: 'free' },
  { id: 'sig-04', severity: 'medium', type: 'sellout', title: 'Estimated sell-out up 18% week on week in Mumbai', detail: 'Driven by Zero Fizz sparkling drinks; estimate excludes restocks.', city: 'Mumbai', product: 'Mango Passion Sparkling · 300 ml', metric: 'Est. units (7d)', delta: '+18%', confidence: 71, detected_at: T(14), rule: 'Est. sell-out swing ≥ 15%', free_or_paid: 'free' },
  { id: 'sig-05', severity: 'medium', type: 'availability', title: 'Tonic Water not listed in Mumbai', detail: 'Product page returns "not listed" for the Mumbai pincode in the last 3 captures.', city: 'Mumbai', product: 'Tonic Water · 300 ml', metric: 'Listing', delta: 'Listed → Not listed', confidence: 90, detected_at: T(20), rule: 'Listing disappears', free_or_paid: 'free' },
  { id: 'sig-06', severity: 'low', type: 'price', title: 'Average discount deepened to 7.9% in Delhi', detail: 'Three Swing SKUs moved from MRP to 10% off in the 14:05 capture.', city: 'Delhi', metric: 'Avg discount', delta: '+1.4 pts', confidence: 77, detected_at: T(26), rule: 'Discount depth change ≥ 1 pt', free_or_paid: 'free' },
  { id: 'sig-07', severity: 'low', type: 'quality', title: 'One capture run blocked in the last 24 hours', detail: 'The 02:00 IST Delhi run was blocked and retried successfully. Figures for that slot are interpolated.', city: 'Delhi', metric: 'Runs', delta: '1 blocked', confidence: 99, detected_at: T(30), rule: 'Blocked request', free_or_paid: 'free' },
  { id: 'sig-08', severity: 'medium', type: 'search', title: '"aam panna" — Paper Boat holds 3 of the top-10 slots in Delhi', detail: 'Share of search 27% (up 4 pts). All three slots are organic.', city: 'Delhi', product: 'Aam Panna Zero · 2 x 200 ml', metric: 'Share of search', delta: '+4 pts', confidence: 84, detected_at: T(40), rule: 'Share of search swing ≥ 3 pts', free_or_paid: 'free' },
];
export const recommendations: Recommendation[] = [
  { id: 'rec-01', priority: 94, city: 'Delhi', product: 'Aamras Mango Drink · 1 ltr', action: 'Escalate restock for the 1 ltr pack in Delhi', why: 'It has been out of stock for 4 captures in all observed Delhi stores while Mumbai sells normally. An estimated ~110 units a week are being lost.', type: 'free', evidence: [{ label: 'Availability by store', query_id: 'q-8841' }, { label: 'Est. sell-out (estimate)', query_id: 'q-8842' }], status: 'new' },
  { id: 'rec-02', priority: 81, city: 'Mumbai', product: 'Aamras Mango Drink · 215 ml', action: 'Test a sponsored slot on "mango drink" in Mumbai', why: 'Organic rank fell from #3 to #7 after a rival bought the top-3 slots. Paid boost is the only lever; it is flagged paid.', type: 'paid', evidence: [{ label: 'Keyword rank history', query_id: 'q-8850' }, { label: 'Top-10 slot owners', query_id: 'q-8851' }], status: 'new' },
  { id: 'rec-03', priority: 66, city: 'Both', product: 'Coconut Water · 200 ml', action: 'Align Delhi price with Mumbai (₹47)', why: 'A 6.4% city gap on one pack, with no difference in MRP.', type: 'free', evidence: [{ label: 'City price gap', query_id: 'q-8860' }], status: 'reviewing' },
  { id: 'rec-04', priority: 58, city: 'Mumbai', product: 'Tonic Water · 300 ml', action: 'Ask Blinkit category team to re-list Tonic Water', why: 'Listing disappeared 3 captures ago. Not a stock-out — the product page is gone.', type: 'free', evidence: [{ label: 'Listing history', query_id: 'q-8870' }], status: 'new' },
  { id: 'rec-05', priority: 44, city: 'Mumbai', product: 'Zero Fizz range', action: 'Keep Zero Fizz stocked ahead of the weekend', why: 'Estimated sell-out is up 18% week on week; stock depth is 1–3 units in several stores.', type: 'free', evidence: [{ label: 'Est. sell-out (estimate)', query_id: 'q-8880' }], status: 'done' },
];

// ---------- alert rules, reports, runs, datasets ----------
export const alert_rules = [
  { id: 'r1', name: 'Out of stock for 3+ captures', scope: 'Both cities', matches: 2, threshold: '3 captures', channel: 'In-app + email', on: true },
  { id: 'r2', name: 'Keyword rank drops by 3+', scope: 'Tracked keywords', matches: 1, threshold: '3 places', channel: 'In-app', on: true },
  { id: 'r3', name: 'City price gap above 5%', scope: 'Priority products', matches: 1, threshold: '5%', channel: 'In-app', on: true },
  { id: 'r4', name: 'Listing disappears', scope: 'Both cities', matches: 1, threshold: 'Any', channel: 'In-app + email', on: true },
  { id: 'r5', name: 'Capture run blocked or stale', scope: 'Capture pipeline', matches: 1, threshold: '6 h', channel: 'Email', on: false },
];
export const reports = [
  { id: 'rep-1', title: 'Monday brief · 5 Oct', kind: 'Weekly', pages: 4, generated: '2026-10-05T03:30:00Z', summary: 'Delhi availability slipped on Aamras 1 ltr; Mumbai gained share of search on aam panna.' },
  { id: 'rep-2', title: 'Daily capture digest · 6 Oct', kind: 'Daily', pages: 1, generated: '2026-10-06T16:00:00Z', summary: '3 captures per city, 1 blocked run, 0 stale feeds.' },
  { id: 'rep-3', title: 'City comparison · Delhi vs Mumbai', kind: 'On demand', pages: 3, generated: '2026-10-04T10:15:00Z', summary: 'Availability, price and rank side by side with the two-point gaps highlighted.' },
  { id: 'rep-4', title: 'Pilot outcome report (draft)', kind: 'Pilot', pages: 8, generated: '2026-10-02T09:00:00Z', summary: 'What the pilot showed, real capture volumes against plan, and what scaling would involve.' },
];
export const capture_runs = [
  { run_id: 'run-0710-1', city: 'Delhi', started: '2026-10-07T08:30:00Z', rows: 112, duration_s: 214, status: 'ok' },
  { run_id: 'run-0710-2', city: 'Mumbai', started: '2026-10-07T08:30:00Z', rows: 112, duration_s: 231, status: 'ok' },
  { run_id: 'run-0709-3', city: 'Delhi', started: '2026-10-07T02:30:00Z', rows: 112, duration_s: 198, status: 'ok' },
  { run_id: 'run-0709-3m', city: 'Mumbai', started: '2026-10-07T02:30:00Z', rows: 112, duration_s: 205, status: 'ok' },
  { run_id: 'run-0709-2', city: 'Delhi', started: '2026-10-06T20:30:00Z', rows: 0, duration_s: 41, status: 'blocked' },
  { run_id: 'run-0709-2r', city: 'Delhi', started: '2026-10-06T20:42:00Z', rows: 112, duration_s: 226, status: 'ok' },
];
export const datasets = [
  { key: 'listing_snapshots', label: 'Listing snapshots', rows: 15680, last: CAPTURED_AT, source: 'Blinkit shelf capture', kb: 2310 },
  { key: 'search_ranks', label: 'Search ranks', rows: 4480, last: CAPTURED_AT, source: 'Blinkit search capture', kb: 690 },
  { key: 'locations', label: 'Delivery locations', rows: 350, last: '2026-10-05T04:00:00Z', source: 'Store discovery', kb: 88 },
  { key: 'products', label: 'Priority products', rows: 14, last: '2026-10-01T04:00:00Z', source: 'Signed-off list', kb: 6 },
  { key: 'raw_snapshots', label: 'Raw responses (JSONB)', rows: 15680, last: CAPTURED_AT, source: 'Capture archive', kb: 41200 },
];
export const quality_issues = [
  { id: 'dq-1', kind: 'Blocked request', where: 'Delhi · 7 Oct 02:00 IST', detail: 'Run blocked; retried after 12 minutes and succeeded.', severity: 'low' as const },
  { id: 'dq-2', kind: 'Missing fields', where: 'Mumbai · Tonic Water 300 ml', detail: 'Product not listed — price, brand and category are empty by design.', severity: 'low' as const },
  { id: 'dq-3', kind: 'Unusual price', where: 'Delhi · Lively Orange 1.2 ltr', detail: 'Selling price moved +14% against the previous capture.', severity: 'medium' as const },
];

// ---------- assistant canned answers (until the AI layer is live) ----------
export const suggested_questions = [
  'Which products are out of stock in Delhi right now?',
  'How does Delhi compare with Mumbai on availability and price?',
  'Where did our search rank drop this week?',
  'What is the estimated sell-out this week?',
];
export const assistant_answers: { match: RegExp; text: string; citations: { label: string; query_id: string }[]; estimate?: boolean }[] = [
  { match: /out of stock|stock|oos|unavailable/i, text: 'In Delhi, one priority product is out of stock: **Aamras Mango Drink · 1 ltr**. It has been out for 4 consecutive captures in all 8 observed stores. In Mumbai, everything listed is buyable; **Tonic Water 300 ml** is not listed at all.', citations: [{ label: 'Availability by store', query_id: 'q-8841' }] },
  { match: /compare|delhi.*mumbai|mumbai.*delhi|city/i, text: 'Delhi is **' + city_compare[0].availability_pct + '%** buyable vs Mumbai **' + city_compare[1].availability_pct + '%**. Average discount is ' + city_compare[0].avg_discount + '% in Delhi and ' + city_compare[1].avg_discount + '% in Mumbai. Mumbai also leads on share of search.', citations: [{ label: 'City comparison', query_id: 'q-8860' }] },
  { match: /rank|search|keyword/i, text: 'The biggest drop is **"mango drink" in Mumbai: #3 → #7**. A rival now holds the top-3 slots through sponsored placements; Paper Boat is organic. In Delhi, "aam panna" is the standout with 3 of the top-10 slots.', citations: [{ label: 'Keyword rank history', query_id: 'q-8850' }] },
  { match: /sell|units|sales/i, text: 'Estimated sell-out for the last 7 days is about **' + city_compare[0].est_units_7d.toLocaleString('en-IN') + ' units in Delhi** and **' + city_compare[1].est_units_7d.toLocaleString('en-IN') + ' in Mumbai**. This is an estimate from stock changes between captures and excludes restocks.', citations: [{ label: 'Est. sell-out (estimate)', query_id: 'q-8842' }], estimate: true },
];
