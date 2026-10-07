/** Builds report previews from the REAL capture where the data exists (availability, discount, estimated sell-out, checks). */
import { buildMaster } from '@/components/pagekit/catalogue';
import { CHECK, CHECKS, runChecks } from '@/components/pagekit/catalogue';
import { platformLabel } from '@/lib/config';
import { availabilityStats, discountPct, groupSum, round1, sum } from '@/lib/metrics';
import type { SelloutInterval, Snapshot } from '@/lib/types';
import { runQuality } from '../data/quality';
import { hash } from '@/mock/data-util';

export type Cell = string | number;
export interface PSection { id: string; h: string; bullets: string[]; cols: string[]; rows: Cell[][]; estimate?: boolean; sample?: boolean }
export interface BuildCtx { latest: Snapshot[]; snapshots: Snapshot[]; intervals: SelloutInterval[]; capturesPerDay: number }

const short = (n: string) => n.replace(/^paper boat\s+/i, '') || '(no title)';
const inr = (n: number | null) => (n === null ? '—' : `₹${n}`);

const availability = (c: BuildCtx): PSection => {
  const st = availabilityStats(c.latest);
  const g = new Map<string, Snapshot[]>();
  c.latest.forEach((r) => (g.get(`${r.platform}|${r.city}`) ?? g.set(`${r.platform}|${r.city}`, []).get(`${r.platform}|${r.city}`)!).push(r));
  return {
    id: 'availability', h: 'Availability',
    bullets: [`${st.buyablePct}% of ${st.listed} listed rows are buyable; ${st.out_of_stock} are out of stock and ${st.not_listed} are not listed.`],
    cols: ['Platform', 'City', 'Listed', 'Buyable', 'Out of stock', 'Not listed', 'Buyable %'],
    rows: Array.from(g.entries()).sort().map(([k, rs]) => { const s = availabilityStats(rs); const [p, ci] = k.split('|'); return [platformLabel(p), ci, s.listed, s.available, s.out_of_stock, s.not_listed, `${s.buyablePct}%`]; }),
  };
};
const exceptions = (c: BuildCtx): PSection => {
  const rs = c.latest.filter((r) => r.availability !== 'available');
  return { id: 'exceptions', h: 'Listings that are not buyable', bullets: [`${rs.length} listing rows are not buyable at the latest capture (out of stock and not listed are shown separately).`], cols: ['Product', 'Pack', 'Platform', 'City', 'State', 'Stock'], rows: rs.map((r) => [short(r.name), r.pack_size || '—', platformLabel(r.platform), r.city, r.availability === 'out_of_stock' ? 'Out of stock' : 'Not listed', r.stock]) };
};
const discount = (c: BuildCtx): PSection => {
  const rs = c.latest.filter((r) => r.mrp !== null && r.selling_price !== null && r.availability !== 'not_listed');
  const disc = rs.filter((r) => discountPct(r.mrp, r.selling_price) > 0);
  const byLine = new Map<string, Snapshot[]>();
  rs.forEach((r) => (byLine.get(r.line) ?? byLine.set(r.line, []).get(r.line)!).push(r));
  return {
    id: 'discount', h: 'Price & discount',
    bullets: [`${disc.length} of ${rs.length} priced rows are discounted; average ${disc.length ? round1(sum(disc.map((r) => discountPct(r.mrp, r.selling_price))) / disc.length) : 0}% among them. Discount is calculated from MRP and selling price.`],
    cols: ['Product line', 'Rows', 'Discounted', 'Avg discount (calc.)'],
    rows: Array.from(byLine.entries()).map(([l, x]) => { const dd = x.filter((r) => discountPct(r.mrp, r.selling_price) > 0); return [l, x.length, dd.length, `${dd.length ? round1(sum(dd.map((r) => discountPct(r.mrp, r.selling_price))) / dd.length) : 0}%`]; }),
  };
};
const priceMatrix = (c: BuildCtx): PSection => {
  const rs = c.latest.filter((r) => r.availability !== 'not_listed' && r.name);
  const cities = Array.from(new Set(rs.map((r) => r.city))).sort();
  const g = new Map<string, Snapshot[]>();
  rs.forEach((r) => (g.get(`${short(r.name)}|${r.pack_size}`) ?? g.set(`${short(r.name)}|${r.pack_size}`, []).get(`${short(r.name)}|${r.pack_size}`)!).push(r));
  return { id: 'matrix', h: 'Price matrix', bullets: ['Selling price by city; the percentage is the calculated discount against MRP.'], cols: ['Product', 'Pack', 'MRP', ...cities], rows: Array.from(g.entries()).slice(0, 40).map(([k, x]) => { const [n, p] = k.split('|'); return [n, p, inr(x[0].mrp), ...cities.map((ci) => { const r = x.find((y) => y.city === ci); return r ? `${inr(r.selling_price)} (${discountPct(r.mrp, r.selling_price)}%)` : '—'; })]; }) };
};
const sellout = (c: BuildCtx): PSection => {
  const units = sum(c.intervals.map((r) => r.units));
  const byCity = groupSum(c.intervals, (r) => r.city, (r) => r.units);
  const revCity = groupSum(c.intervals, (r) => r.city, (r) => r.revenue);
  return {
    id: 'sellout', h: 'Estimated sell-out', estimate: true,
    bullets: [`Estimate: about ${units.toLocaleString('en-IN')} units across ${c.intervals.length} capture intervals. A lower bound from stock falling between captures; restocks are never counted as sales.`],
    cols: ['City', 'Est. units', 'Est. revenue'],
    rows: Object.keys(byCity).sort().map((ci) => [ci, byCity[ci], `₹${Math.round(revCity[ci]).toLocaleString('en-IN')}`]),
  };
};
const topSellers = (c: BuildCtx): PSection => {
  const by = Object.entries(groupSum(c.intervals, (r) => `${short(r.name)}|${r.pack_size}`, (r) => r.units)).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { id: 'top', h: 'Highest estimated sellers', estimate: true, bullets: ['Ranked by estimated units over the capture window.'], cols: ['Product', 'Pack', 'Est. units'], rows: by.map(([k, u]) => [...k.split('|'), u]) };
};
const shelf = (c: BuildCtx): PSection => {
  const rs = c.latest.filter((r) => r.shelf_life_days !== null && r.availability !== 'not_listed').sort((a, b) => (a.shelf_life_days ?? 0) - (b.shelf_life_days ?? 0)).slice(0, 14);
  return { id: 'shelf', h: 'Shortest shelf life', bullets: ['Products dated shortest, with units currently on the shelf.'], cols: ['Product', 'Pack', 'City', 'Shelf life (days)', 'Units on shelf'], rows: rs.map((r) => [short(r.name), r.pack_size, r.city, r.shelf_life_days ?? 0, r.stock]) };
};
const content = (c: BuildCtx): PSection => {
  const defects = runChecks(c.latest);
  const by = groupSum(defects, (x) => x.checkId, () => 1);
  return { id: 'content', h: 'Defects by check', bullets: [`${defects.length} defects across ${c.latest.length} listing rows. Image and description checks are sample.`], cols: ['Check', 'Defects', 'Fix'], rows: CHECKS.filter((k) => by[k.id]).map((k) => [k.label + (k.real ? '' : ' (sample)'), by[k.id], CHECK[k.id].fix]) };
};
const catalogue = (c: BuildCtx): PSection => {
  const { skus, unmatched } = buildMaster(c.latest);
  return { id: 'catalogue', h: 'Catalogue matches', bullets: [`${skus.length} canonical SKUs; ${unmatched.length} listing ids have no title and are unmatched.`], cols: ['SKU', 'Name', 'Pack', 'Platform ids'], rows: skus.slice(0, 30).map((s) => [s.sku, short(s.name), s.pack, s.ids.map((i) => i.product_id).join(', ')]) };
};
const dq = (c: BuildCtx): PSection => {
  const q = runQuality(c.snapshots, c.latest, c.capturesPerDay);
  return { id: 'dq', h: 'Quality checks', bullets: [`${q.filter((x) => x.status === 'pass').length} of ${q.length} checks pass on the current capture.`], cols: ['Check', 'Checked', 'Failed', 'Result'], rows: q.map((x) => [x.check, x.checked, x.failed, x.status]) };
};
const sample = (id: string, h: string, bullets: string[], cols: string[], rows: Cell[][]): PSection => ({ id, h, bullets, cols, rows, sample: true });

export function buildReport(id: string, c: BuildCtx): PSection[] {
  switch (id) {
    case 'brief': return [availability(c), discount(c), sellout(c), topSellers(c)];
    case 'availx': return [exceptions(c), availability(c)];
    case 'price': return [discount(c), priceMatrix(c)];
    case 'sellout': return [sellout(c), topSellers(c)];
    case 'deadstock': return [shelf(c)];
    case 'content': return [content(c)];
    case 'catalogue': return [catalogue(c)];
    case 'dq': return [dq(c)];
    case 'compet': return [sample('brands', 'Brand benchmark', ['Sample: Paper Boat price index against tracked brands.'], ['Brand', 'Price index', 'Promo depth'], [['Paper Boat', 100, '12%'], ['Real', 104, '9%'], ['Tropicana', 112, '14%'], ['B Natural', 97, '18%'], ['Maaza', 88, '15%']])];
    case 'search': return [sample('sos', 'Share of search', ['Sample: share of first-page results by keyword.'], ['Keyword', 'Results', 'Ours', 'Share'], ['fruit juice', 'mango drink', 'coconut water', 'sparkling drink', 'tonic water'].map((k, i) => [k, 40 + hash(k) % 30, 4 + (hash(k) % 9), `${8 + ((hash(k) + i) % 18)}%`]))];
    case 'media': return [sample('roas', 'Spend and return', ['Sample: sponsored spend against availability.'], ['Platform', 'Spend (₹ L)', 'ROAS', 'Spend on unavailable SKUs'], [['Blinkit', 6.1, '3.4×', '0.3'], ['Zepto', 4.4, '3.1×', '0.5']])];
    default: return [sample('facc', 'Forecast accuracy', ['Sample: demand model against baseline.'], ['Week', 'MAPE', 'Baseline MAPE'], [['W36', '18%', '24%'], ['W37', '16%', '23%'], ['W38', '17%', '25%']])];
  }
}
