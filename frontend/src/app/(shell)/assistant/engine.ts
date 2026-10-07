/**
 * Deterministic answer engine for the Assistant. Every answer is computed from the captured shelf data
 * (d.latest / d.snapshots / d.intervals) with the shared metric helpers — nothing is generated text from a model.
 * Each answer carries citations: named queries (q-1042) with the exact rows behind the numbers.
 */
import { CITIES, PLATFORMS, platformLabel } from '@/lib/config';
import { availabilityStats, discountAmount, discountPct, groupSum, round1, sum } from '@/lib/metrics';
import type { SelloutInterval, Snapshot } from '@/lib/types';
import { isUntitled, buildMaster, findDuplicates, findPackConflicts, nameTokens, skuKeyOf } from '@/components/pagekit/catalogue';
import { hash } from '@/mock/data-util';

export type Cell = string | number;
export type Row = Record<string, Cell>;
export interface Col { key: string; title: string; align?: 'right' }
export interface Citation { id: string; label: string; query: string; columns: Col[]; rows: Row[]; note?: string }
export interface Answer {
  intent: string;
  title: string;
  lines: string[];
  table?: { columns: Col[]; rows: Row[] };
  citations: Citation[];
  estimate?: boolean;
  followups: string[];
  scope: string;
}

export interface Ctx {
  latest: Snapshot[];
  snapshots: Snapshot[];
  intervals: SelloutInterval[];
  capturedAt: string;
  /** optional narrowing chosen in the Change-scope modal */
  platforms?: string[];
  cities?: string[];
  dataset?: string;
}

const pct = (a: number, b: number) => (b ? round1((a / b) * 100) : 0);
const short = (n: string) => (n ? n.replace(/^paper boat\s+/i, '') : '(no title)');
const inr = (n: number | null) => (n === null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`);

const STOP = new Set(['the', 'and', 'for', 'are', 'what', 'which', 'how', 'many', 'show', 'tell', 'does', 'did', 'have', 'has', 'with', 'from', 'that', 'this', 'now', 'any', 'all', 'our', 'out', 'stock', 'price', 'prices', 'sold', 'sell', 'sales', 'units', 'city', 'cities', 'between', 'about', 'across', 'products', 'product', 'skus', 'sku', 'listing', 'listings', 'discount', 'discounts', 'level', 'levels', 'shelf', 'life', 'category', 'categories', 'right', 'today', 'latest', 'last', 'best', 'worst', 'top', 'most', 'least', 'lowest', 'highest', 'est', 'estimated', 'platform', 'platforms', 'available', 'availability', 'restock', 'restocks', 'restocked', 'gap', 'gaps', 'mrp', 'paper', 'boat', 'blinkit', 'low', 'running', 'recently', 'biggest', 'whats', 'there', 'when', 'where', 'who', 'why', 'than', 'more', 'less', 'each', 'every', 'per', 'few', 'list', 'give', 'find', 'tell', 'right', 'drink', 'drinks', 'sugar']);

export interface Mentions { cities: string[]; platforms: string[]; terms: string[] }
export function mentions(q: string, rows: Snapshot[]): Mentions {
  const l = q.toLowerCase();
  const cities = CITIES.filter((c) => l.includes(c.label.toLowerCase())).map((c) => c.id);
  const platforms = PLATFORMS.filter((p) => l.includes(p.label.toLowerCase()) || (!['now', 'minutes'].includes(p.id) && new RegExp(`\\b${p.id}\\b`).test(l))).map((p) => p.id);
  const vocab = new Set<string>();
  rows.forEach((r) => !isUntitled(r) && nameTokens(r.name).forEach((t) => t.length >= 3 && vocab.add(t)));
  const words = l.replace(/[^a-z0-9⁺+ ]/g, ' ').split(/\s+/).filter(Boolean);
  const terms = words.filter((w) => !STOP.has(w) && vocab.has(w.replace(/[⁺+]/g, '')));
  return { cities, platforms, terms: Array.from(new Set(terms)) };
}

const rowOf = (r: Snapshot): Row => ({
  product: short(r.name) || `id ${r.product_id}`,
  pack: r.pack_size || '—',
  platform: platformLabel(r.platform),
  city: r.city,
  state: r.availability === 'available' ? 'Buyable' : r.availability === 'out_of_stock' ? 'Out of stock' : 'Not listed',
  mrp: inr(r.mrp),
  price: inr(r.selling_price),
  discount: `${discountPct(r.mrp, r.selling_price)}%`,
  stock: r.stock,
  id: r.product_id,
});
const COLS = {
  base: [{ key: 'product', title: 'Product' }, { key: 'pack', title: 'Pack' }, { key: 'platform', title: 'Platform' }, { key: 'city', title: 'City' }] as Col[],
  state: { key: 'state', title: 'State' } as Col,
  price: [{ key: 'mrp', title: 'MRP', align: 'right' }, { key: 'price', title: 'Price', align: 'right' }, { key: 'discount', title: 'Discount (calc.)', align: 'right' }] as Col[],
  stock: { key: 'stock', title: 'Stock', align: 'right' } as Col,
};

export const SUGGESTIONS = [
  'What is out of stock right now?',
  'Show availability by city',
  'Which products have the biggest discount?',
  'Where do prices differ between cities?',
  'Estimated sell-out in the last captures',
  'Which products are running low on stock?',
  'Which products were restocked recently?',
  'What is the shortest shelf life on the shelf?',
  'How many products per category?',
];

export function qid(question: string, n: number) {
  return `q-${1000 + ((hash(question.toLowerCase().trim()) + n * 97) % 9000)}`;
}

function intentOf(q: string, ds?: string): string {
  const l = q.toLowerCase();
  if (/(^|\b)(hi|hello|hey|help)\b/.test(l) && l.length < 20) return 'help';
  if (/sell-?out|sold|units|sales|revenue|demand|velocity|selling/.test(l)) return 'sellout';
  if (/restock|replenish|refill|came back|back in stock/.test(l)) return 'restock';
  if (/price gap|gap|cheaper|costlier|more expensive|price diff|differ|compare.*(price|cit)|prices? (in|across|between)/.test(l)) return 'gap';
  if (/discount|offer|deal|% off|markdown|promo|mrp|savings/.test(l)) return 'discount';
  if (/out of stock|oos|stock-?out|unavailable|not available|sold out|missing|not buyable/.test(l)) return 'oos';
  if (/availab|buyable|coverage|by city|per city|in stock/.test(l)) return 'availability';
  if (/shelf.?life|expiry|expire|fresh|days left|dated/.test(l)) return 'shelf';
  if (/stock|inventory|running low|low on|units left|how much/.test(l)) return 'stock';
  if (/catalog|unmatched|duplicate|sku master|matching|crosswalk/.test(l)) return 'catalogue';
  if (/categor|breakdown|how many (products|skus)|product line|\blines?\b|assortment|range/.test(l)) return 'category';
  if (ds === 'sellout') return 'sellout';
  if (ds === 'price') return 'discount';
  if (ds === 'stock') return 'stock';
  if (ds === 'catalogue') return 'catalogue';
  return 'unknown';
}

export function answer(question: string, ctx: Ctx): Answer {
  const q = question.trim();
  const m = mentions(q, ctx.latest);
  const intent = intentOf(q, ctx.dataset);

  // scope: global filters are already applied upstream; the scope modal and any city/platform named in the question narrow further
  const platforms = m.platforms.length ? m.platforms : ctx.platforms;
  const cities = m.cities.length ? m.cities : ctx.cities;
  const keepRow = (r: Snapshot) => {
    if (platforms?.length && !platforms.includes(r.platform)) return false;
    if (cities?.length && !cities.includes(r.city)) return false;
    if (m.terms.length) {
      const t = nameTokens(r.name);
      if (!m.terms.every((x) => t.includes(x))) return false;
    }
    return true;
  };
  const keepIv = (r: SelloutInterval) => {
    if (platforms?.length && !platforms.includes(r.platform)) return false;
    if (cities?.length && !cities.includes(r.city)) return false;
    if (m.terms.length) {
      const t = nameTokens(r.name);
      if (!m.terms.every((x) => t.includes(x))) return false;
    }
    return true;
  };
  const latest = ctx.latest.filter(keepRow);
  const termsLabel = m.terms.length ? `“${m.terms.join(' ')}”` : '';
  const scopeBits = [platforms?.length ? platforms.map(platformLabel).join(' + ') : 'all platforms', cities?.length ? cities.join(' + ') : 'all cities', termsLabel].filter(Boolean);
  const scope = scopeBits.join(' · ');
  const base = { scope, citations: [] as Citation[], followups: [] as string[] };
  let n = 0;
  const cite = (label: string, columns: Col[], rows: Row[], note?: string): Citation => ({ id: qid(q, n++), label, query: label, columns, rows, note });
  const listedWithPrice = () => latest.filter((r) => r.availability !== 'not_listed' && r.mrp !== null && r.selling_price !== null);
  const when = new Date(ctx.capturedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';

  if (!latest.length) {
    return { ...base, intent: 'empty', title: 'Nothing in that scope', lines: [`No captured listings match ${scope}. Try widening the scope or the product name.`], followups: SUGGESTIONS.slice(0, 3) };
  }

  switch (intent) {
    case 'help':
      return { ...base, intent, title: 'What I can answer', lines: ['I answer from the Paper Boat shelf capture: availability, stock-outs, discounts (calculated from MRP and selling price), price gaps between cities, estimated sell-out, stock levels, restocks, shelf life and the catalogue.', 'Name a product, city or platform to narrow a question, e.g. “Is Swing out of stock in Mumbai?”.'], followups: SUGGESTIONS.slice(0, 4) };

    case 'oos': {
      const oos = latest.filter((r) => r.availability === 'out_of_stock');
      const st = availabilityStats(latest);
      const byCity = groupSum(oos, (r) => r.city, () => 1);
      const lines = [
        `${oos.length} of ${st.listed} listed rows are out of stock at the ${when} capture (${pct(oos.length, st.listed)}%). Buyable share of listed: ${st.buyablePct}%.`,
        Object.keys(byCity).length ? `By city: ${Object.entries(byCity).map(([c, v]) => `${c} ${v}`).join(' · ')}.` : 'No stock-outs in this scope.',
        st.not_listed ? `${st.not_listed} further rows are not listed at all — that is a different state from out of stock.` : '',
      ].filter(Boolean);
      const both = (() => {
        const m2 = new Map<string, Set<string>>();
        oos.forEach((r) => (m2.get(skuKeyOf(r)) ?? m2.set(skuKeyOf(r), new Set()).get(skuKeyOf(r))!).add(r.city));
        return Array.from(m2.entries()).filter(([, s]) => s.size > 1).length;
      })();
      if (both) lines.push(`${both} product${both > 1 ? 's are' : ' is'} out of stock in more than one city.`);
      const rows = oos.map(rowOf);
      return { ...base, intent, title: 'Out of stock now', lines, table: { columns: [...COLS.base, COLS.state], rows: rows.slice(0, 10) }, citations: [cite(`out_of_stock · latest capture · ${scope}`, [...COLS.base, COLS.state, COLS.stock], rows), cite('availability_stats · latest capture', [{ key: 'k', title: 'Measure' }, { key: 'v', title: 'Rows', align: 'right' }], [{ k: 'Buyable', v: st.available }, { k: 'Out of stock', v: st.out_of_stock }, { k: 'Not listed', v: st.not_listed }, { k: 'Listed', v: st.listed }])], followups: ['Show availability by city', 'Which products were restocked recently?'] };
    }

    case 'availability': {
      const groups = new Map<string, Snapshot[]>();
      latest.forEach((r) => (groups.get(`${r.platform}|${r.city}`) ?? groups.set(`${r.platform}|${r.city}`, []).get(`${r.platform}|${r.city}`)!).push(r));
      const rows: Row[] = Array.from(groups.entries()).sort().map(([k, rs]) => {
        const s = availabilityStats(rs);
        const [p, c] = k.split('|');
        return { platform: platformLabel(p), city: c, listed: s.listed, buyable: s.available, oos: s.out_of_stock, notl: s.not_listed, pct: `${s.buyablePct}%` };
      });
      const cols: Col[] = [{ key: 'platform', title: 'Platform' }, { key: 'city', title: 'City' }, { key: 'listed', title: 'Listed', align: 'right' }, { key: 'buyable', title: 'Buyable', align: 'right' }, { key: 'oos', title: 'Out of stock', align: 'right' }, { key: 'notl', title: 'Not listed', align: 'right' }, { key: 'pct', title: 'Buyable %', align: 'right' }];
      const all = availabilityStats(latest);
      return { ...base, intent, title: 'Availability by city', lines: [`Overall ${all.buyablePct}% of ${all.listed} listed rows are buyable (${all.available} buyable, ${all.out_of_stock} out of stock, ${all.not_listed} not listed).`, ...rows.map((r) => `${r.platform} · ${r.city}: ${r.pct} buyable (${r.oos} out of stock)`)], table: { columns: cols, rows }, citations: [cite(`availability_by_city · latest capture · ${scope}`, cols, rows), cite('listing_rows · latest capture', [...COLS.base, COLS.state], latest.map(rowOf))], followups: ['What is out of stock right now?'] };
    }

    case 'discount': {
      const rs = listedWithPrice();
      const disc = rs.filter((r) => discountAmount(r.mrp, r.selling_price) > 0);
      const avg = disc.length ? round1(sum(disc.map((r) => discountPct(r.mrp, r.selling_price))) / disc.length) : 0;
      const top = [...disc].sort((a, b) => discountPct(b.mrp, b.selling_price) - discountPct(a.mrp, a.selling_price));
      const rows = top.map(rowOf);
      const cols = [...COLS.base, ...COLS.price];
      return { ...base, intent, title: 'Discounts on the shelf', lines: [`${disc.length} of ${rs.length} priced rows carry a discount; the average among them is ${avg}%. Discount is calculated as (MRP − selling price) ÷ MRP, never read from the feed.`, top[0] ? `Deepest: ${short(top[0].name)} ${top[0].pack_size} in ${top[0].city} at ${discountPct(top[0].mrp, top[0].selling_price)}% off (${inr(top[0].mrp)} → ${inr(top[0].selling_price)}).` : 'No discounted rows in this scope.', `${rs.length - disc.length} rows sell at full MRP.`], table: { columns: cols, rows: rows.slice(0, 8) }, citations: [cite(`discount_calc = (mrp - selling_price)/mrp · ${scope}`, cols, rows, 'Discount is derived from MRP and selling price.'), cite('full_price_rows', cols, rs.filter((r) => discountAmount(r.mrp, r.selling_price) === 0).map(rowOf))], followups: ['Where do prices differ between cities?'] };
    }

    case 'gap': {
      const rs = listedWithPrice();
      const g = new Map<string, Snapshot[]>();
      rs.forEach((r) => (g.get(`${r.platform}|${skuKeyOf(r)}`) ?? g.set(`${r.platform}|${skuKeyOf(r)}`, []).get(`${r.platform}|${skuKeyOf(r)}`)!).push(r));
      const multi = Array.from(g.values()).filter((x) => new Set(x.map((r) => r.city)).size > 1);
      const gaps = multi.map((x) => {
        const sorted = [...x].sort((a, b) => (a.selling_price ?? 0) - (b.selling_price ?? 0));
        const lo = sorted[0];
        const hi = sorted[sorted.length - 1];
        return { lo, hi, gap: round1((hi.selling_price ?? 0) - (lo.selling_price ?? 0)) };
      }).filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap);
      const rows: Row[] = gaps.map((x) => ({ product: short(x.hi.name), pack: x.hi.pack_size, platform: platformLabel(x.hi.platform), low: `${x.lo.city} ${inr(x.lo.selling_price)}`, high: `${x.hi.city} ${inr(x.hi.selling_price)}`, gap: inr(x.gap), pct: `${pct(x.gap, x.lo.selling_price ?? 0)}%` }));
      const cols: Col[] = [{ key: 'product', title: 'Product' }, { key: 'pack', title: 'Pack' }, { key: 'platform', title: 'Platform' }, { key: 'low', title: 'Lowest' }, { key: 'high', title: 'Highest' }, { key: 'gap', title: 'Gap', align: 'right' }, { key: 'pct', title: 'Gap %', align: 'right' }];
      return { ...base, intent, title: 'Price gaps between cities', lines: multi.length ? [`${gaps.length} of ${multi.length} products sold in more than one city have a selling-price gap.`, gaps[0] ? `Widest: ${short(gaps[0].hi.name)} ${gaps[0].hi.pack_size} — ${inr(gaps[0].lo.selling_price)} in ${gaps[0].lo.city} vs ${inr(gaps[0].hi.selling_price)} in ${gaps[0].hi.city}.` : 'All shared products are priced the same across cities.', 'Gaps are small by design on quick commerce; a gap here usually means a local promo, not a different MRP.'] : ['Need at least two cities in scope to compare prices. Widen the city filter.'], table: gaps.length ? { columns: cols, rows: rows.slice(0, 8) } : undefined, citations: [cite(`price_gap_by_city · selling_price · ${scope}`, cols, rows), cite('rows_compared', [...COLS.base, ...COLS.price], multi.flat().map(rowOf))], followups: ['Which products have the biggest discount?'] };
    }

    case 'sellout': {
      const iv = ctx.intervals.filter(keepIv);
      const units = sum(iv.map((r) => r.units));
      const rev = sum(iv.map((r) => r.revenue));
      const byCity = groupSum(iv, (r) => r.city, (r) => r.units);
      const byProd = Object.entries(groupSum(iv, (r) => `${short(r.name)} · ${r.pack_size}`, (r) => r.units)).sort((a, b) => b[1] - a[1]);
      const prodRows: Row[] = byProd.filter((x) => x[1] > 0).map(([p, u]) => ({ product: p, units: u }));
      const ivRows: Row[] = iv.filter((r) => r.units > 0).sort((a, b) => b.units - a.units).map((r) => ({ product: short(r.name), pack: r.pack_size, city: r.city, from: r.stock_from, to: r.stock_to, units: r.units, rev: inr(r.revenue), capture: r.capture_id }));
      return { ...base, intent, estimate: true, title: 'Estimated sell-out', lines: [`Estimate: about ${units.toLocaleString('en-IN')} units (≈ ${inr(rev)}) sold across ${iv.length} capture intervals in scope. This is a lower bound — it counts stock falling between consecutive captures; restocks are never counted as sales.`, Object.keys(byCity).length ? `By city: ${Object.entries(byCity).map(([c, v]) => `${c} ${v}`).join(' · ')} units.` : '', byProd[0] && byProd[0][1] > 0 ? `Highest estimated seller: ${byProd[0][0]} (${byProd[0][1]} units).` : 'No stock falls were observed.'].filter(Boolean), table: prodRows.length ? { columns: [{ key: 'product', title: 'Product · pack' }, { key: 'units', title: 'Est. units', align: 'right' }], rows: prodRows.slice(0, 8) } : undefined, citations: [cite(`sellout_estimate = max(0, stock_prev - stock_now) · ${scope}`, [{ key: 'product', title: 'Product' }, { key: 'pack', title: 'Pack' }, { key: 'city', title: 'City' }, { key: 'from', title: 'Stock before', align: 'right' }, { key: 'to', title: 'Stock after', align: 'right' }, { key: 'units', title: 'Est. units', align: 'right' }, { key: 'rev', title: 'Est. revenue', align: 'right' }, { key: 'capture', title: 'Capture' }], ivRows, 'Estimate: lower bound, from stock change between captures.')], followups: ['Which products were restocked recently?', 'Which products are running low on stock?'] };
    }

    case 'restock': {
      const iv = ctx.intervals.filter(keepIv).filter((r) => r.restocked > 0).sort((a, b) => (a.to < b.to ? 1 : -1));
      const rows: Row[] = iv.map((r) => ({ product: short(r.name), pack: r.pack_size, city: r.city, from: r.stock_from, to: r.stock_to, added: r.restocked, capture: r.capture_id }));
      const cols: Col[] = [{ key: 'product', title: 'Product' }, { key: 'pack', title: 'Pack' }, { key: 'city', title: 'City' }, { key: 'from', title: 'Stock before', align: 'right' }, { key: 'to', title: 'Stock after', align: 'right' }, { key: 'added', title: 'Units added', align: 'right' }, { key: 'capture', title: 'Capture' }];
      const top = Object.entries(groupSum(iv, (r) => short(r.name), () => 1)).sort((a, b) => b[1] - a[1]);
      return { ...base, intent, title: 'Restocks', lines: [`${iv.length} restock events (stock rose between captures) in scope, adding ${sum(iv.map((r) => r.restocked))} units. Restocks are never counted as sales.`, top[0] ? `Most frequently restocked: ${top[0][0]} (${top[0][1]} events).` : 'No restocks observed.'], table: iv.length ? { columns: cols, rows: rows.slice(0, 8) } : undefined, citations: [cite(`restock_events = stock_now > stock_prev · ${scope}`, cols, rows)], followups: ['Estimated sell-out in the last captures'] };
    }

    case 'stock': {
      const buy = latest.filter((r) => r.availability === 'available').sort((a, b) => a.stock - b.stock);
      const low = buy.filter((r) => r.stock <= 5);
      const rows = buy.map(rowOf);
      const cols = [...COLS.base, COLS.stock];
      return { ...base, intent, title: 'Stock levels', lines: [`${buy.length} buyable rows show ${sum(buy.map((r) => r.stock)).toLocaleString('en-IN')} units on shelf in total (average ${buy.length ? round1(sum(buy.map((r) => r.stock)) / buy.length) : 0} per row).`, `${low.length} buyable rows hold 5 units or fewer — the next to go out of stock.`, low[0] ? `Lowest: ${short(low[0].name)} ${low[0].pack_size} in ${low[0].city} (${low[0].stock} unit${low[0].stock === 1 ? '' : 's'}).` : ''].filter(Boolean), table: { columns: cols, rows: rows.slice(0, 8) }, citations: [cite(`stock_on_shelf · buyable rows, ascending · ${scope}`, cols, rows)], followups: ['What is out of stock right now?', 'Which products were restocked recently?'] };
    }

    case 'shelf': {
      const rs = latest.filter((r) => r.shelf_life_days !== null).sort((a, b) => (a.shelf_life_days ?? 0) - (b.shelf_life_days ?? 0));
      const rows: Row[] = rs.map((r) => ({ ...rowOf(r), life: r.shelf_life, days: r.shelf_life_days ?? 0 }));
      const cols = [...COLS.base, { key: 'life', title: 'Shelf life' }, { key: 'days', title: 'Days', align: 'right' } as Col];
      const seen = new Set<string>();
      const shortest = rs.filter((r) => (seen.has(skuKeyOf(r)) ? false : (seen.add(skuKeyOf(r)), true)));
      return { ...base, intent, title: 'Shelf life', lines: [`Shortest shelf life: ${shortest[0] ? `${short(shortest[0].name)} ${shortest[0].pack_size} at ${shortest[0].shelf_life_days} days` : 'n/a'}. Longest: ${shortest.length ? `${short(shortest[shortest.length - 1].name)} at ${shortest[shortest.length - 1].shelf_life_days} days` : 'n/a'}.`, `${shortest.filter((r) => (r.shelf_life_days ?? 0) < 200).length} products are dated under 200 days (Nata De Coco and Swing juice variants).`], table: { columns: cols, rows: rows.filter((_, i) => i < 8) }, citations: [cite(`shelf_life_days ascending · ${scope}`, cols, rows)], followups: ['Which products are running low on stock?'] };
    }

    case 'category': {
      const g = new Map<string, Snapshot[]>();
      latest.forEach((r) => {
        const c = (r.category.split('>').pop() ?? '').trim() || '(no category)';
        (g.get(c) ?? g.set(c, []).get(c)!).push(r);
      });
      const rows: Row[] = Array.from(g.entries()).sort((a, b) => b[1].length - a[1].length).map(([c, rs]) => {
        const s = availabilityStats(rs);
        return { category: c, products: new Set(rs.map(skuKeyOf)).size, rows: rs.length, buyable: `${s.buyablePct}%` };
      });
      const cols: Col[] = [{ key: 'category', title: 'Category' }, { key: 'products', title: 'Distinct products', align: 'right' }, { key: 'rows', title: 'Listing rows', align: 'right' }, { key: 'buyable', title: 'Buyable %', align: 'right' }];
      return { ...base, intent, title: 'Products by category', lines: [`${new Set(latest.map(skuKeyOf)).size} distinct products across ${rows.length} platform categories.`, `Largest category: ${rows[0]?.category} (${rows[0]?.products} products).`], table: { columns: cols, rows }, citations: [cite(`group by category · ${scope}`, cols, rows), cite('listing_rows', [...COLS.base, COLS.state], latest.map(rowOf))], followups: ['Show availability by city'] };
    }

    case 'catalogue': {
      const { skus, unmatched } = buildMaster(latest);
      const dupes = findDuplicates(skus);
      const packs = findPackConflicts(skus);
      const rows: Row[] = skus.map((s) => ({ sku: s.sku, name: short(s.name), pack: s.pack, ids: s.ids.map((i) => `${i.city}:${i.product_id}`).join(', ') }));
      const cols: Col[] = [{ key: 'sku', title: 'SKU' }, { key: 'name', title: 'Name' }, { key: 'pack', title: 'Pack' }, { key: 'ids', title: 'Platform ids' }];
      return { ...base, intent, title: 'Catalogue matching', lines: [`${skus.length} canonical SKUs are tied to ${latest.length - unmatched.length} of ${latest.length} captured listings; ${unmatched.length} listing ids have no title and cannot be tied yet.`, `${dupes.length} pairs look like one product written two ways, and ${packs.length} SKUs share a title with a different pack size.`], table: { columns: cols, rows: rows.slice(0, 8) }, citations: [cite(`canonical_sku_master · ${scope}`, cols, rows), cite('unmatched_listings', [{ key: 'id', title: 'Platform id' }, { key: 'city', title: 'City' }, { key: 'state', title: 'State' }], unmatched.map((r) => ({ id: r.product_id, city: r.city, state: r.availability })))], followups: ['How many products per category?'] };
    }

    default: {
      if (m.terms.length) {
        // a product name with no explicit question: give a one-glance summary
        const st = availabilityStats(latest);
        const rs = listedWithPrice();
        const rows = latest.map(rowOf);
        const cols = [...COLS.base, COLS.state, ...COLS.price, COLS.stock];
        const iv = ctx.intervals.filter(keepIv);
        return { ...base, intent: 'product', estimate: true, title: `${termsLabel} on the shelf`, lines: [`${new Set(latest.map(skuKeyOf)).size} product${new Set(latest.map(skuKeyOf)).size > 1 ? 's' : ''} matched across ${latest.length} listing rows: ${st.available} buyable, ${st.out_of_stock} out of stock, ${st.not_listed} not listed.`, rs.length ? `Average discount ${round1(sum(rs.map((r) => discountPct(r.mrp, r.selling_price))) / rs.length)}% (calculated).` : '', `Estimated units sold across captures: ${sum(iv.map((r) => r.units))} (estimate, lower bound).`].filter(Boolean), table: { columns: cols, rows: rows.slice(0, 8) }, citations: [cite(`listing_rows · ${scope}`, cols, rows)], followups: SUGGESTIONS.slice(0, 3) };
      }
      return { ...base, intent: 'unknown', title: 'I could not map that to the data', lines: [`I answer from the shelf capture (${when}). I did not recognise a measure in “${q}”.`, 'Try asking about stock-outs, availability by city, discounts, price gaps between cities, estimated sell-out, stock levels, restocks, shelf life or categories — and name a product, city or platform to narrow it.'], followups: SUGGESTIONS.slice(0, 5) };
    }
  }
}
