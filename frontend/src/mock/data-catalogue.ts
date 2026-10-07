/** SAMPLE matching evidence for Catalogue Matching (the blind re-check and rival benchmark are not computed from the capture). */
import { hash, unit } from '@/mock/data-util';

export const RECHECK_SPLIT = [
  { outcome: 'Agrees with the carried SKU', share: 0.957, reading: 'Independent match lands on the same SKU' },
  { outcome: 'Agrees on the family, differs on the pack', share: 0.028, reading: 'Same title, different pack size — see pack conflicts' },
  { outcome: 'Disagrees', share: 0.011, reading: 'Re-match prefers a different SKU — review' },
  { outcome: 'No answer', share: 0.004, reading: 'Listing too sparse to re-match' },
];

export const RIVAL_BRANDS = ['Real', 'Tropicana', 'B Natural', 'Raw Pressery', 'Maaza', 'Frooti', 'Slice', 'Amul'];

/** benchmark rows per platform: how many rival listings have a comparable Paper Boat pack on the same platform */
export function rivalByPlatform(platforms: string[], pbListed: (p: string) => number) {
  return platforms.map((p) => {
    const rows = 120 + (hash(p) % 80);
    const comparable = Math.round(rows * (0.58 + unit(`${p}c`) * 0.2));
    return { platform: p, rows, comparable, share: Math.round((comparable / rows) * 1000) / 10, pbListed: pbListed(p) };
  });
}
export const rivalBrandRows = (platformCount: number) =>
  RIVAL_BRANDS.map((b) => {
    const rows = (14 + (hash(b) % 30)) * platformCount;
    const comparable = Math.round(rows * (0.5 + unit(`${b}x`) * 0.3));
    return { brand: b, rows, comparable, share: Math.round((comparable / rows) * 1000) / 10 };
  });
