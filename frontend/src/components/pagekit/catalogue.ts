/**
 * Catalogue analysis on the REAL capture: canonical SKU master, duplicate-id pairs, pack conflicts and
 * content-health checks. Pure functions over `Snapshot[]` (d.latest) so they work unchanged on backend data.
 */
import { discountPct, productLine, round1 } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';
import { hash } from '@/mock/data-util';

// ---------------------------------------------------------------- names and packs
/** the capture gives a not-listed id with no title (the mock fills it as “Unlisted SKU <id>”) */
export const isUntitled = (r: Pick<Snapshot, 'name'>) => !r.name || /^Unlisted SKU/i.test(r.name);
export const nameTokens = (name: string) =>
  name.toLowerCase().replace(/paper boat/g, ' ').replace(/[⁺+]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
/** order- and punctuation-insensitive identity of a title ("Aamras/ Mango Drink" == "Aamras Mango Drink") */
export const nameKey = (name: string) => Array.from(new Set(nameTokens(name))).sort().join(' ');

export interface Pack { count: number; unitMl: number; totalMl: number; label: string }
export function parsePack(p: string): Pack | null {
  const m = p.toLowerCase().match(/^(?:(\d+)\s*x\s*)?([\d.]+)\s*(ml|ltr|l|g|kg)\b/);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const size = Number(m[2]);
  const unitMl = m[3] === 'ml' || m[3] === 'g' ? size : size * 1000;
  return { count, unitMl, totalMl: count * unitMl, label: p };
}

export const skuKeyOf = (r: Pick<Snapshot, 'name' | 'pack_size'>) => `${nameKey(r.name)}|${parsePack(r.pack_size)?.totalMl ?? r.pack_size}`;

// ---------------------------------------------------------------- canonical SKU master
export interface PlatformId { platform: string; city: string; product_id: string; availability: Snapshot['availability'] }
export interface SkuGroup {
  sku: string;
  key: string;
  nameKey: string;
  name: string;
  names: string[];
  pack: string;
  totalMl: number | null;
  line: string;
  category: string;
  ids: PlatformId[];
  rows: Snapshot[];
  platforms: string[];
  cities: string[];
}

export function buildMaster(latest: Snapshot[]): { skus: SkuGroup[]; unmatched: Snapshot[] } {
  const unmatched = latest.filter((r) => isUntitled(r));
  const m = new Map<string, Snapshot[]>();
  for (const r of latest) {
    if (isUntitled(r)) continue;
    const k = skuKeyOf(r);
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  const used = new Set<string>();
  const skus: SkuGroup[] = [];
  m.forEach((rows, key) => {
    const names = Array.from(new Set(rows.map((r) => r.name)));
    const name = names.map((n) => ({ n, c: rows.filter((r) => r.name === n).length })).sort((a, b) => b.c - a.c || a.n.localeCompare(b.n))[0].n;
    let num = (hash(key) % 9000) + 1000;
    while (used.has(`PB-${num}`)) num += 1;
    used.add(`PB-${num}`);
    const first = rows[0];
    const idMap = new Map<string, PlatformId>();
    rows.forEach((r) => idMap.set(`${r.platform}|${r.city}|${r.product_id}`, { platform: r.platform, city: r.city, product_id: r.product_id, availability: r.availability }));
    skus.push({
      sku: `PB-${num}`,
      key,
      nameKey: nameKey(name),
      name,
      names,
      pack: first.pack_size,
      totalMl: parsePack(first.pack_size)?.totalMl ?? null,
      line: productLine(name),
      category: (first.category.split('>').pop() ?? '').trim(),
      ids: Array.from(idMap.values()),
      rows,
      platforms: Array.from(new Set(rows.map((r) => r.platform))),
      cities: Array.from(new Set(rows.map((r) => r.city))),
    });
  });
  skus.sort((a, b) => a.line.localeCompare(b.line) || a.name.localeCompare(b.name) || (a.totalMl ?? 0) - (b.totalMl ?? 0));
  return { skus, unmatched };
}

// ---------------------------------------------------------------- duplicates and pack conflicts
export interface DupePair { id: string; a: SkuGroup; b: SkuGroup; tier: 'variant'; why: string }
/** Two canonical SKUs with the same normalised title but written differently ("Aamras/ Mango Drink" vs "Aamras Mango Drink", "Swing+" vs "Swing⁺"). */
export function findDuplicates(skus: SkuGroup[]): DupePair[] {
  const out: DupePair[] = [];
  for (let i = 0; i < skus.length; i++)
    for (let j = i + 1; j < skus.length; j++) {
      const a = skus[i];
      const b = skus[j];
      if (a.nameKey !== b.nameKey) continue;
      if (a.names.some((n) => b.names.includes(n))) continue;
      out.push({ id: `${a.sku}~${b.sku}`, a, b, tier: 'variant', why: `Same words, written differently: “${a.name.replace(/^paper boat\s+/i, '')}” vs “${b.name.replace(/^paper boat\s+/i, '')}”` });
    }
  return out;
}

export interface PackConflict {
  id: string;
  master: SkuGroup;
  observed: SkuGroup;
  kind: 'multipack' | 'size';
  parsedMl: number | null;
}
/** Within one normalised title the smallest pack is the master; any other pack seen is a conflict to resolve. */
export function findPackConflicts(skus: SkuGroup[]): PackConflict[] {
  const byKey = new Map<string, SkuGroup[]>();
  skus.forEach((s) => (byKey.get(s.nameKey) ?? byKey.set(s.nameKey, []).get(s.nameKey)!).push(s));
  const out: PackConflict[] = [];
  byKey.forEach((g) => {
    if (g.length < 2) return;
    const sorted = [...g].sort((a, b) => (a.totalMl ?? 1e9) - (b.totalMl ?? 1e9));
    const master = sorted[0];
    sorted.slice(1).forEach((o) => {
      const mp = parsePack(o.pack);
      out.push({ id: `${master.sku}>${o.sku}`, master, observed: o, kind: mp && mp.count > 1 && mp.unitMl === master.totalMl ? 'multipack' : 'size', parsedMl: o.totalMl });
    });
  });
  return out;
}

// ---------------------------------------------------------------- content-health checks
export interface CheckDef { id: string; label: string; trips: string; fix: string; weight: number; real: boolean; field: string }
export const CHECKS: CheckDef[] = [
  { id: 'missing_title', label: 'Listing has no title', trips: 'The id is known but the listing carries no name, pack or category', fix: 'Re-capture the listing or delist the dead id', weight: 60, real: true, field: 'title' },
  { id: 'missing_pack', label: 'Pack size missing', trips: 'pack_size is empty', fix: 'Add the pack size to the listing', weight: 15, real: true, field: 'pack_size' },
  { id: 'missing_category', label: 'Platform category missing', trips: 'category is empty', fix: 'Assign the platform category', weight: 15, real: true, field: 'category' },
  { id: 'missing_mrp', label: 'MRP missing', trips: 'mrp is empty on a listed product', fix: 'Fill the MRP from the price master', weight: 20, real: true, field: 'mrp' },
  { id: 'price_gt_mrp', label: 'Selling price above MRP', trips: 'selling_price > mrp', fix: 'Correct the price or the MRP', weight: 25, real: true, field: 'selling_price' },
  { id: 'price_pack_mismatch', label: 'Price does not fit the pack', trips: 'MRP per ml is >20% off same-size siblings, or a multipack is not count × single', fix: 'Check pack size against MRP', weight: 20, real: true, field: 'mrp' },
  { id: 'title_format', label: 'Title formatting inconsistent', trips: 'Slash spacing, “+” vs “⁺”, lowercase brand, or another word order of the same title', fix: 'Align the title with the master naming', weight: 10, real: true, field: 'title' },
  { id: 'marketer_variant', label: 'Marketer address differs', trips: 'Marketer text differs from the most common Paper Boat address', fix: 'Use the registered marketer address', weight: 10, real: true, field: 'marketer' },
  { id: 'short_shelf_life', label: 'Short shelf life', trips: 'shelf_life_days under 200', fix: 'Confirm batch dating with the supply team', weight: 5, real: true, field: 'shelf_life' },
  { id: 'images', label: 'Fewer than 4 images', trips: 'Image count below the platform minimum', fix: 'Upload the standard image set', weight: 10, real: false, field: 'images' },
  { id: 'description', label: 'Description under 120 characters', trips: 'Short or missing description', fix: 'Use the approved description copy', weight: 10, real: false, field: 'description' },
];
export const CHECK = Object.fromEntries(CHECKS.map((c) => [c.id, c])) as Record<string, CheckDef>;

export interface Defect { checkId: string; row: Snapshot; seen: string; proposed: string }

const normMarketer = (s: string) => s.toLowerCase().replace(/regd|office|pvt|ltd/g, '').replace(/[^a-z0-9]/g, '');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

export function runChecks(latest: Snapshot[]): Defect[] {
  const out: Defect[] = [];
  const listed = latest.filter((r) => r.availability !== 'not_listed');
  // reference values
  const mk = new Map<string, number>();
  listed.forEach((r) => r.marketer && mk.set(normMarketer(r.marketer), (mk.get(normMarketer(r.marketer)) ?? 0) + 1));
  const modalMk = Array.from(mk.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const perMl = new Map<string, number[]>();
  listed.forEach((r) => {
    const p = parsePack(r.pack_size);
    if (r.mrp && p && p.count === 1) (perMl.get(`${r.line}|${p.totalMl}`) ?? perMl.set(`${r.line}|${p.totalMl}`, []).get(`${r.line}|${p.totalMl}`)!).push(r.mrp);
  });
  const singleMrp = new Map<string, number>();
  listed.forEach((r) => {
    const p = parsePack(r.pack_size);
    if (r.mrp && p && p.count === 1) singleMrp.set(`${nameKey(r.name)}|${r.city}|${p.unitMl}`, r.mrp);
  });
  const titlesByKey = new Map<string, Set<string>>();
  listed.forEach((r) => (titlesByKey.get(nameKey(r.name)) ?? titlesByKey.set(nameKey(r.name), new Set()).get(nameKey(r.name))!).add(r.name));

  const add = (checkId: string, row: Snapshot, seen: string, proposed: string) => out.push({ checkId, row, seen, proposed });

  for (const r of latest) {
    if (r.availability === 'not_listed') {
      if (isUntitled(r)) add('missing_title', r, `Not listed · id ${r.product_id} · no name, pack or category`, 'Re-capture or retire the id');
      continue;
    }
    if (!r.pack_size) add('missing_pack', r, 'pack_size empty', 'Add pack size');
    if (!r.category) add('missing_category', r, 'category empty', 'Assign category');
    if (r.mrp === null) add('missing_mrp', r, 'mrp empty', 'Fill MRP');
    if (r.mrp !== null && r.selling_price !== null && r.selling_price > r.mrp) add('price_gt_mrp', r, `Price ₹${r.selling_price} > MRP ₹${r.mrp}`, `Set price ≤ ₹${r.mrp}`);
    const p = parsePack(r.pack_size);
    if (r.mrp && p) {
      if (p.count === 1) {
        const peers = perMl.get(`${r.line}|${p.totalMl}`) ?? [];
        const med = median(peers);
        if (peers.length >= 3 && med > 0 && Math.abs(r.mrp - med) / med > 0.2) add('price_pack_mismatch', r, `MRP ₹${r.mrp} for ${r.pack_size}; same-size ${r.line} median ₹${round1(med)}`, `Verify pack or MRP (≈ ₹${round1(med)})`);
      } else {
        const single = singleMrp.get(`${nameKey(r.name)}|${r.city}|${p.unitMl}`);
        if (single && Math.abs(single * p.count - r.mrp) > 1) add('price_pack_mismatch', r, `MRP ₹${r.mrp} for ${r.pack_size}; single is ₹${single}`, `Expect ₹${single * p.count}`);
      }
    }
    const t = r.name;
    const sibs = titlesByKey.get(nameKey(t));
    if (/\s\/|\/\s|\//.test(t) || /\+/.test(t) || !/^Paper Boat/.test(t) || (sibs && sibs.size > 1) || /\s{2}|\s$/.test(t)) {
      const hint = /\+/.test(t) ? '“+” should be “⁺”' : /\//.test(t) ? 'slash spacing' : !/^Paper Boat/.test(t) ? 'brand not title-cased' : 'another spelling of the same title exists';
      add('title_format', r, `“${t}” · ${hint}`, 'Align to master title');
    }
    if (r.marketer && normMarketer(r.marketer) !== modalMk) add('marketer_variant', r, `Marketer: ${r.marketer.replace(/^"/, '').slice(0, 70)}…`, 'Use registered address');
    if (r.shelf_life_days !== null && r.shelf_life_days < 200) add('short_shelf_life', r, `Shelf life ${r.shelf_life_days} days`, 'Confirm batch dating');
    // sample checks (the capture has no image/description fields): deterministic from the id
    const h = hash(`${r.platform}|${r.product_id}`);
    if (h % 11 === 0) add('images', r, 'Sample: 3 images on listing', 'Upload standard set');
    if (h % 13 === 0) add('description', r, 'Sample: description 74 characters', 'Use approved copy');
  }
  return out;
}

export const scoreOf = (defects: Defect[]) => Math.max(0, 100 - defects.reduce((a, d) => a + CHECK[d.checkId].weight, 0));

export const discLabel = (r: Snapshot) => `${discountPct(r.mrp, r.selling_price)}%`;
