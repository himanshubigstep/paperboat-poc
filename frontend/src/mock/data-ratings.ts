/**
 * SAMPLE ratings. The capture has no rating field yet, so listing ratings are generated deterministically,
 * anchored to the REAL SKUs / product lines / platforms / cities of the capture.
 */
import { hash, unit } from '@/mock/data-util';

export interface SkuLite { sku: string; name: string; pack: string; line: string; platforms: string[]; cities: string[] }
export interface RatedListing { key: string; sku: string; name: string; pack: string; line: string; platform: string; cities: string[]; rating: number; reviews: number }

const LINE_BASE: Record<string, number> = { 'Nata De Coco': 4.25, Aamras: 4.35, 'Aam Panna': 4.3, 'Coconut Water': 4.2, Swing: 4.15, 'Zero Fizz': 4.0, 'Zero Prebiotic Soda': 3.85, Mixers: 4.05, 'Zero / Ethnic': 4.3, Other: 4.1 };
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildRatings(skus: SkuLite[]): RatedListing[] {
  const out: RatedListing[] = [];
  for (const s of skus)
    for (const p of s.platforms) {
      const key = `${s.sku}|${p}`;
      const rated = unit(`${key}|has`) > 0.06; // a few listings carry no rating yet
      if (!rated) continue;
      const base = LINE_BASE[s.line] ?? 4.1;
      const rating = Math.min(4.9, Math.max(3.1, r1(base + (unit(key) - 0.5) * 1.1 - (unit(`${key}|d`) > 0.9 ? 0.5 : 0))));
      out.push({ key, sku: s.sku, name: s.name, pack: s.pack, line: s.line, platform: p, cities: s.cities, rating, reviews: 25 + Math.floor(unit(`${key}|n`) ** 2 * 4200) });
    }
  return out;
}

export interface BrandRow { brand: string; mean: number; weighted: number; listings: number; ratings: number; platforms: number }
const RIVALS: { brand: string; base: number; n: number }[] = [
  { brand: 'Real', base: 4.18, n: 34 }, { brand: 'Tropicana', base: 4.12, n: 29 }, { brand: 'B Natural', base: 4.05, n: 31 },
  { brand: 'Raw Pressery', base: 4.22, n: 18 }, { brand: 'Maaza', base: 4.3, n: 22 }, { brand: 'Frooti', base: 4.27, n: 20 },
  { brand: 'Slice', base: 4.2, n: 17 }, { brand: 'Amul', base: 4.4, n: 12 },
];
export function buildBrands(pb: { mean: number; weighted: number; listings: number; ratings: number }, platformCount: number): BrandRow[] {
  const rivals = RIVALS.map((b) => ({ brand: b.brand, mean: r2(b.base + (unit(b.brand) - 0.5) * 0.12), weighted: r2(b.base + (unit(`${b.brand}w`) - 0.5) * 0.1), listings: b.n * platformCount, ratings: 4000 + (hash(b.brand) % 90000), platforms: platformCount }));
  return [{ brand: 'Paper Boat', mean: pb.mean, weighted: pb.weighted, listings: pb.listings, ratings: pb.ratings, platforms: platformCount }, ...rivals].sort((a, b) => b.mean - a.mean);
}
