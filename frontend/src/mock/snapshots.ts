/**
 * Dummy capture history.
 *
 * The LATEST capture of every listing is the real Blinkit scrape (blinkit_listings.json, 91 rows,
 * scraped 2026-09-29). The backend will deliver three captures a day; to show the "how many were sold"
 * calculation we synthesise the 40 captures before it (14 days x 3/day) with a seeded RNG, so stock,
 * price and availability move realistically and SSR/client agree.
 *
 * Replace with GET /api/v1/snapshots when the backend is live — nothing else changes.
 */
import raw from '@/mock/blinkit_listings.json';
import { CAPTURE_SLOTS_UTC } from '@/lib/config';
import { productLine } from '@/lib/metrics';
import type { Availability, Snapshot } from '@/lib/types';

type Raw = (typeof raw)[number];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
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

const LAST_DATE = '2026-09-29';
const LAST_SLOT = 1; // the real scrape belongs to slot S2 (06:30 UTC = 12:00 IST)
const DAYS_BACK = 13;

/** capture timeline: [{date, slot, id}] oldest -> newest, ending at the real scrape */
export const TIMELINE = (() => {
  const out: { date: string; slot: number; id: string }[] = [];
  for (let d = DAYS_BACK; d >= 0; d--) {
    const date = new Date(Date.parse(LAST_DATE + 'T00:00:00Z') - d * 86400_000).toISOString().slice(0, 10);
    for (let s = 0; s < 3; s++) {
      if (date === LAST_DATE && s > LAST_SLOT) break;
      out.push({ date, slot: s, id: `${date}-S${s + 1}` });
    }
  }
  return out;
})();

const LINE_POPULARITY: Record<string, number> = { Swing: 1.2, Aamras: 1.4, 'Aam Panna': 1.3, 'Coconut Water': 0.9, 'Zero Fizz': 0.8, 'Zero Prebiotic Soda': 0.6, Mixers: 0.4, 'Nata De Coco': 0.5, 'Zero / Ethnic': 1.0, Other: 0.5 };

function build(): Snapshot[] {
  const out: Snapshot[] = [];
  const N = TIMELINE.length;

  raw.forEach((r: Raw, idx) => {
    const name = r.name || `Unlisted SKU ${r.product_id}`;
    const line = productLine(name);
    const rnd = rng(hash(`${r.platform}|${r.city}|${r.product_id}`));
    const pop = (LINE_POPULARITY[line] ?? 0.7) * (0.6 + rnd() * 0.9) * (r.city === 'Mumbai' ? 1.15 : 1);
    const finalAvail = r.availability as Availability;

    // ----- stock path: generated BACKWARDS from the real last capture so history joins it smoothly.
    // Going back, stock rises by what sold in each gap; past the shelf cap it means a restock happened
    // (stock was low and jumped up), which restarts the sawtooth.
    const stocks: number[] = new Array(N).fill(0);
    if (finalAvail !== 'not_listed') {
      const CAP = Math.max(7, r.stock + 4); // shelf depth stays near today's level
      let cur = finalAvail === 'out_of_stock' ? 0 : Math.max(1, r.stock);
      let start = N - 1;
      stocks[N - 1] = cur;
      if (finalAvail === 'out_of_stock') {
        const k = 2 + Math.floor(rnd() * 4); // out of stock for the last k captures
        for (let i = N - k; i < N; i++) stocks[i] = 0;
        cur = 3 + Math.floor(rnd() * 5); // it sold out from this level
        start = N - k - 1;
        stocks[start] = cur;
      }
      for (let i = start; i >= 1; i--) {
        const sold = Math.floor(rnd() * pop * 2.4);
        let prev = cur + sold;
        if (prev > CAP) prev = 1 + Math.floor(rnd() * 3); // a restock lifted it from a low level
        stocks[i - 1] = prev;
        cur = prev;
      }
    }

    // ----- price path: MRP fixed, selling price had a change-point
    const mrp = r.mrp;
    const finalPrice = r.selling_price;
    const change = Math.floor(N * 0.4 + rnd() * N * 0.5);
    const earlyPrice = (i: number): number | null => {
      if (mrp === null || finalPrice === null) return null;
      if (i >= change) return finalPrice;
      if (finalPrice < mrp) return rnd() < 0.5 ? mrp : Math.round(mrp - (mrp - finalPrice) * 0.5);
      return i >= change - 6 && rnd() < 0.25 ? Math.round(mrp * 0.92) : mrp;
    };

    TIMELINE.forEach((t, i) => {
      const isReal = i === N - 1;
      const slotTime = CAPTURE_SLOTS_UTC[t.slot];
      const jitter = (idx * 7) % 26; // minutes — each listing is scraped a bit later than the last
      const scraped_at = isReal ? r.scraped_at : new Date(Date.parse(`${t.date}T${slotTime}:00Z`) + jitter * 60_000).toISOString().replace('.000Z', 'Z');
      const stock = stocks[i];
      const availability: Availability = finalAvail === 'not_listed' ? 'not_listed' : stock > 0 ? 'available' : 'out_of_stock';
      out.push({
        platform: r.platform,
        city: r.city,
        pincode: r.pincode,
        store_id: r.store_id,
        product_id: r.product_id,
        name,
        brand: r.brand || 'Paper Boat',
        pack_size: r.pack_size,
        category: r.category,
        line,
        mrp: isReal ? mrp : mrp,
        selling_price: isReal ? finalPrice : earlyPrice(i),
        availability: isReal ? finalAvail : availability,
        stock: isReal ? (finalAvail === 'out_of_stock' ? 0 : stock) : stock,
        shelf_life: r.shelf_life,
        shelf_life_days: r.shelf_life_days,
        marketer: r.marketer,
        store_name: r.store_name || null,
        store_address: r.store_address || null,
        url: r.url,
        scraped_at,
        capture_id: t.id,
      });
    });
  });
  return out.sort((a, b) => (a.scraped_at < b.scraped_at ? -1 : a.scraped_at > b.scraped_at ? 1 : 0));
}

let cache: Snapshot[] | null = null;
export const getSnapshots = () => (cache ??= build());
