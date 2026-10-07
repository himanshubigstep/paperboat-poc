/**
 * Signals derived from the captured shelf data (rule-based, no sample numbers).
 * Types follow the reference product's tabs: Availability · Search · Pricing · Competitor ·
 * Inventory & expiry · Forecast · Media · Data quality. Only the ones the shelf capture can
 * prove are produced here; Search/Competitor/Forecast/Media signals come from sample feeds.
 */
import { discountPct, listingKey, round1 } from '@/lib/metrics';
import type { SelloutInterval, Severity, Signal, Snapshot } from '@/lib/types';

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const short = (n: string) => n.replace(/^paper boat\s+/i, '');

export function deriveSignals(snaps: Snapshot[], iv: SelloutInterval[]): Signal[] {
  const out: Signal[] = [];
  if (!snaps.length) return out;
  let n = 0;
  const id = () => `sig-${String(++n).padStart(2, '0')}`;

  const groups = new Map<string, Snapshot[]>();
  for (const s of snaps) {
    const k = listingKey(s);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  groups.forEach((g) => g.sort((a, b) => (a.scraped_at < b.scraped_at ? -1 : 1)));

  let noPrice = 0;
  groups.forEach((g) => {
    const last = g[g.length - 1];
    const prev = g[g.length - 2];
    const label = `${short(last.name)} · ${last.pack_size}`;

    if (last.availability === 'not_listed') {
      noPrice += 1;
      return;
    }

    // --- out-of-stock streak
    let streak = 0;
    for (let i = g.length - 1; i >= 0 && g[i].availability === 'out_of_stock'; i--) streak++;
    if (streak >= 2) {
      const severity: Severity = streak >= 5 ? 'critical' : streak >= 3 ? 'high' : 'medium';
      out.push({
        id: id(), severity, type: 'Availability', platform: last.platform, city: last.city, product: label,
        title: `${label} is out of stock in ${last.city}`,
        detail: `Out of stock for ${streak} consecutive captures${last.store_id ? ` at store ${last.store_id}` : ''}. Demand during this window is not observable.`,
        metric: 'Buyable', delta: `${streak} captures`, confidence: Math.min(98, 70 + streak * 6), detected_at: last.scraped_at,
        rule: 'Out of stock for 2+ consecutive captures',
      });
    }

    // --- discount moved vs ~3 days earlier (9 captures)
    const ref = g[Math.max(0, g.length - 10)];
    if (ref && last.mrp && ref.mrp) {
      const d = round1(discountPct(last.mrp, last.selling_price) - discountPct(ref.mrp, ref.selling_price));
      if (Math.abs(d) >= 4) {
        out.push({
          id: id(), severity: Math.abs(d) >= 8 ? 'medium' : 'low', type: 'Pricing', platform: last.platform, city: last.city, product: label,
          title: `Discount ${d > 0 ? 'deepened' : 'pulled back'} on ${label} in ${last.city}`,
          detail: `Selling price ₹${last.selling_price} against MRP ₹${last.mrp}; ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} pts versus three days ago.`,
          metric: 'Discount', delta: `${d > 0 ? '+' : ''}${d} pts`, confidence: 90, detected_at: last.scraped_at, rule: 'Discount depth change ≥ 4 pts in 3 days',
        });
      }
    }

    // --- restock
    if (prev && last.stock - prev.stock >= 8) {
      out.push({
        id: id(), severity: 'low', type: 'Inventory & expiry', platform: last.platform, city: last.city, product: label,
        title: `${label} was restocked in ${last.city}`,
        detail: `Stock went from ${prev.stock} to ${last.stock}. Restocks are excluded from estimated sell-out.`,
        metric: 'Stock', delta: `+${last.stock - prev.stock}`, confidence: 95, detected_at: last.scraped_at, rule: 'Stock up ≥ 8 units between captures',
      });
    }
  });

  // --- same pack, different price across cities (latest capture)
  const latestByProduct = new Map<string, Snapshot[]>();
  groups.forEach((g) => {
    const l = g[g.length - 1];
    if (l.selling_price && l.availability !== 'not_listed') (latestByProduct.get(`${l.platform}|${l.product_id}`) ?? latestByProduct.set(`${l.platform}|${l.product_id}`, []).get(`${l.platform}|${l.product_id}`)!).push(l);
  });
  latestByProduct.forEach((ls) => {
    if (ls.length < 2) return;
    const lo = ls.reduce((a, b) => ((a.selling_price as number) <= (b.selling_price as number) ? a : b));
    const hi = ls.reduce((a, b) => ((a.selling_price as number) >= (b.selling_price as number) ? a : b));
    const gap = round1((((hi.selling_price as number) - (lo.selling_price as number)) / (lo.selling_price as number)) * 100);
    if (gap >= 5) {
      out.push({
        id: id(), severity: gap >= 15 ? 'high' : 'medium', type: 'Pricing', platform: hi.platform, city: `${lo.city} + ${hi.city}`, product: `${short(hi.name)} · ${hi.pack_size}`,
        title: `${short(hi.name)} costs ${gap}% more in ${hi.city} than ${lo.city}`,
        detail: `₹${hi.selling_price} in ${hi.city} versus ₹${lo.selling_price} in ${lo.city} for the same pack.`,
        metric: 'City price gap', delta: `+${gap}%`, confidence: 88, detected_at: hi.scraped_at, rule: 'Same pack, city price gap ≥ 5%',
      });
    }
  });

  // --- estimated sell-out swing, last 24 h vs the 24 h before (per city)
  const byCity = new Map<string, SelloutInterval[]>();
  iv.forEach((r) => (byCity.get(`${r.platform}|${r.city}`) ?? byCity.set(`${r.platform}|${r.city}`, []).get(`${r.platform}|${r.city}`)!).push(r));
  byCity.forEach((rows, k) => {
    const end = Date.parse(rows.reduce((a, b) => (a.to > b.to ? a : b)).to);
    const cur = rows.filter((r) => Date.parse(r.to) > end - 86400_000).reduce((a, r) => a + r.units, 0);
    const prior = rows.filter((r) => Date.parse(r.to) <= end - 86400_000 && Date.parse(r.to) > end - 2 * 86400_000).reduce((a, r) => a + r.units, 0);
    if (prior >= 20) {
      const ch = Math.round(((cur - prior) / prior) * 100);
      if (Math.abs(ch) >= 20) {
        const [platform, city] = k.split('|');
        out.push({
          id: id(), severity: Math.abs(ch) >= 40 ? 'high' : 'medium', type: 'Availability', platform, city,
          title: `Estimated sell-out ${ch > 0 ? 'up' : 'down'} ${Math.abs(ch)}% day on day in ${city}`,
          detail: `${cur} units in the last 24 h against ${prior} the day before. Estimate from stock changes between captures, restocks excluded.`,
          metric: 'Est. units (24 h)', delta: `${ch > 0 ? '+' : ''}${ch}%`, confidence: 72, detected_at: rows[rows.length - 1].to, rule: 'Estimated sell-out swing ≥ 20% day on day',
        });
      }
    }
  });

  // --- data quality
  if (noPrice > 0) {
    const l = snaps[snaps.length - 1];
    out.push({
      id: id(), severity: 'low', type: 'Data quality', platform: l.platform, city: Array.from(new Set(snaps.map((s) => s.city))).join(' + '),
      title: `${noPrice} listings returned no price or MRP`,
      detail: 'These are "not listed" on the platform for that pincode, so price, brand and category are empty by design — not a capture error.',
      metric: 'Missing fields', delta: `${noPrice} listings`, confidence: 99, detected_at: l.scraped_at, rule: 'Missing price/MRP on a listing',
    });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.confidence - a.confidence);
}
