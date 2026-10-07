/**
 * Signals & Insights — enrichment of REAL signals (lib/signals.ts) and seeded SAMPLE signals for the
 * types the shelf capture cannot prove (Search, Competitor, Forecast, Media, CFA expiry).
 */
import { platformLabel } from '@/lib/config';
import type { Severity, Signal } from '@/lib/types';
import { addH, type Anchor, intBetween, KEYWORDS, pickOf, RIVALS, rng } from '@/mock/ops-common';

export type SigStatus = 'New' | 'Acknowledged' | 'In progress' | 'Snoozed' | 'Resolved' | 'Dismissed';
export const SIGNAL_TYPES = ['Availability', 'Search', 'Pricing', 'Competitor', 'Inventory & expiry', 'Forecast', 'Media', 'Data quality'] as const;

export interface OpsSignal extends Signal {
  real: boolean;
  status: SigStatus;
  owner: string;
  impactInr: number | null;
  evidence: { label: string; value: string }[];
  hyp: { k: 'yes' | 'no' | 'unk'; t: string; n: string }[];
  actions: { t: string; mode: 'Approve' | 'Draft' | 'Coordinate'; owner: string }[];
  timeline: { at: string; tone: 'act' | 'ok' | 'warn' | ''; text: string }[];
  /** small evidence chart for sample signals */
  chart?: { x: string; y: number; s: string }[];
  chartTitle?: string;
}

const OWNER: Record<string, string> = {
  Availability: 'Supply planner', Pricing: 'Category manager', 'Inventory & expiry': 'Supply planner', 'Data quality': 'IT / data lead',
  Search: 'Retail media manager', Competitor: 'Category manager', Forecast: 'Demand planner', Media: 'Retail media manager',
};
export const OWNERS = Array.from(new Set(Object.values(OWNER))).sort();

const REAL_HYP: Record<string, OpsSignal['hyp']> = {
  Availability: [
    { k: 'unk', t: 'Low cover at the dark store', n: 'Store inventory is not in the shelf capture; needs the platform inventory report' },
    { k: 'no', t: 'Listing suppressed', n: 'The listing is still returned with a price, flagged out of stock' },
    { k: 'unk', t: 'Demand spike drained stock', n: 'Check the estimated sell-out in the capture window' },
  ],
  Pricing: [
    { k: 'yes', t: 'Platform-side price or offer change', n: 'Selling price differs while MRP is unchanged, so it is a discount move' },
    { k: 'unk', t: 'City-level pricing rule', n: 'Cannot be confirmed from the shelf; ask the account team' },
  ],
  'Inventory & expiry': [{ k: 'yes', t: 'Replenishment received', n: 'Stock rose between two consecutive captures' }, { k: 'no', t: 'Data error', n: 'Stock consistent over the next capture' }],
  'Data quality': [{ k: 'yes', t: 'Product not listed for that pincode', n: 'Price, brand and category are empty by design for not-listed rows' }],
};
const REAL_ACTIONS: Record<string, OpsSignal['actions']> = {
  Availability: [
    { t: 'Escalate replenishment to the platform account team', mode: 'Approve', owner: 'Supply planner' },
    { t: 'Pause sponsored bids on out-of-stock listings for 72 h', mode: 'Approve', owner: 'Retail media manager' },
  ],
  Pricing: [
    { t: 'Review the price against the pricing corridor and raise a correction', mode: 'Approve', owner: 'Category manager' },
    { t: 'Ask the account team whether the offer is platform-funded', mode: 'Coordinate', owner: 'Key account manager' },
  ],
  'Inventory & expiry': [{ t: 'Confirm batch and expiry on the received stock', mode: 'Coordinate', owner: 'Supply planner' }],
  'Data quality': [{ t: 'Confirm the not-listed products are intended gaps', mode: 'Draft', owner: 'IT / data lead' }],
};

function statusFor(id: string): SigStatus {
  const n = parseInt(id.replace(/\D/g, ''), 10) || 0;
  return n % 7 === 3 ? 'Acknowledged' : n % 11 === 5 ? 'In progress' : 'New';
}

export function enrichReal(signals: Signal[]): OpsSignal[] {
  return signals.map((s) => {
    const status = statusFor(s.id);
    return {
      ...s,
      real: true,
      status,
      owner: OWNER[s.type] ?? 'Category manager',
      impactInr: null,
      evidence: [
        { label: 'Product', value: s.product ?? 'All listings' },
        { label: 'Metric', value: s.metric },
        { label: 'Change', value: s.delta },
        { label: 'Confidence', value: `${s.confidence}%` },
        { label: 'Rule', value: s.rule },
        { label: 'Detected', value: s.detected_at.slice(0, 16).replace('T', ' ') + ' UTC' },
      ],
      hyp: REAL_HYP[s.type] ?? REAL_HYP.Availability,
      actions: REAL_ACTIONS[s.type] ?? REAL_ACTIONS.Availability,
      timeline: [
        { at: s.detected_at, tone: 'act', text: `Signal generated (rule: ${s.rule})` },
        ...(status !== 'New' ? [{ at: addH(s.detected_at, 3), tone: 'ok' as const, text: `${status} by ${OWNER[s.type] ?? 'owner'}` }] : [{ at: '', tone: '' as const, text: 'Awaiting owner acknowledgement' }]),
      ],
    };
  });
}

interface Scope {
  platforms: string[];
  cities: string[];
  capturedAt: string;
  anchors: Anchor[];
}

/** Seeded sample signals: Search, Competitor, Forecast, Media, CFA expiry — deterministic for a given scope. */
export function sampleSignals({ platforms, cities, capturedAt, anchors }: Scope): OpsSignal[] {
  if (!platforms.length || !cities.length) return [];
  const r = rng(`sig|${platforms.join()}|${cities.join()}`);
  const out: OpsSignal[] = [];
  let n = 0;
  const id = () => `smp-${String(++n).padStart(2, '0')}`;
  const where = () => ({ platform: pickOf(r, platforms), city: pickOf(r, cities) });
  const anchor = () => (anchors.length ? pickOf(r, anchors) : undefined);
  const mk = (p: Partial<OpsSignal> & Pick<OpsSignal, 'type' | 'severity' | 'title' | 'detail' | 'platform' | 'city' | 'metric' | 'delta' | 'rule'>, hoursAgo: number): OpsSignal => {
    const status: SigStatus = p.status ?? 'New';
    const at = addH(capturedAt, -hoursAgo);
    return {
      id: id(), confidence: intBetween(r, 70, 92), detected_at: at, real: false, status, owner: OWNER[p.type] ?? 'Category manager', impactInr: null,
      evidence: [], hyp: [], actions: [], timeline: [{ at, tone: 'act', text: `Signal generated (rule: ${p.rule})` }, { at: '', tone: '', text: 'Awaiting owner acknowledgement' }],
      ...p,
    };
  };

  // --- Search
  for (let i = 0; i < 2; i++) {
    const w = where();
    const kw = KEYWORDS[(i * 2 + Math.floor(r() * 2)) % KEYWORDS.length];
    const rank = intBetween(r, 12, 27);
    const share = (r() * 8 + 6).toFixed(1);
    const rivals = [pickOf(r, RIVALS), pickOf(r, RIVALS), pickOf(r, RIVALS)];
    out.push(mk({
      type: 'Search', severity: rank > 20 ? 'high' : 'medium', platform: w.platform, city: w.city, metric: 'Best organic rank', delta: `#${rank}`, rule: 'Best organic rank outside top 8 on a platform',
      title: `"${kw}": best organic rank #${rank} on ${platformLabel(w.platform)} ${w.city}`,
      detail: `Paper Boat holds ${share}% of the results for "${kw}". ${Array.from(new Set(rivals)).join(', ')} occupy the top slots.`,
      impactInr: intBetween(r, 40, 140) * 1000,
      evidence: [{ label: 'Query', value: kw }, { label: 'Best organic rank', value: `#${rank}` }, { label: 'Share of search', value: `${share}%` }, { label: 'Top-3 holders', value: Array.from(new Set(rivals)).join(', ') }],
      hyp: [
        { k: 'yes', t: 'Listing titles lack the query term', n: 'Keyword relevance is low in the title and attributes' },
        { k: 'unk', t: 'Sponsored competitors above the fold', n: 'Sponsored slots are not tagged in the shelf capture' },
        { k: 'no', t: 'Availability', n: 'Singles are buyable in the city' },
      ],
      actions: [
        { t: `Add "${kw}" to listing titles and attributes`, mode: 'Draft', owner: 'Content owner' },
        { t: `Run a 2-week sponsored test on "${kw}" in ${w.city}`, mode: 'Approve', owner: 'Retail media manager' },
      ],
      chart: ['Rank 1-3', 'Rank 4-8', 'Rank 9-16', 'Rank 17+'].map((x, k) => ({ x, y: [2, 3, 5, 9][k] + intBetween(r, 0, 2), s: 'Paper Boat results' })),
      chartTitle: 'Paper Boat results by rank band',
    }, 20 + i * 9));
  }

  // --- Competitor
  for (let i = 0; i < 2; i++) {
    const w = where();
    const rival = RIVALS[(i * 3 + Math.floor(r() * 3)) % RIVALS.length];
    const disc = intBetween(r, 28, 46);
    out.push(mk({
      type: 'Competitor', severity: disc > 40 ? 'high' : 'medium', platform: w.platform, city: w.city, metric: 'Rival avg discount', delta: `${disc}%`, rule: 'Rival discount > 10 pts deeper than Paper Boat',
      title: `${rival} is discounting ${disc}% on ${platformLabel(w.platform)} ${w.city}`,
      detail: `${rival}'s average discount is ${disc - 18} pts deeper than Paper Boat's on the same shelf; the gap held for 5 captures.`,
      impactInr: intBetween(r, 30, 90) * 1000,
      evidence: [{ label: 'Rival', value: rival }, { label: 'Rival avg discount', value: `${disc}%` }, { label: 'Paper Boat avg discount', value: `${disc - 18}%` }, { label: 'Captures held', value: '5' }],
      hyp: [{ k: 'yes', t: 'Platform-funded promotion', n: 'Stable across captures and cities' }, { k: 'unk', t: 'Clearance of near-expiry stock', n: 'Batch data is not observable' }],
      actions: [{ t: 'Prepare a bundle-vs-discount scenario with a contribution check', mode: 'Draft', owner: 'Category manager' }],
      chart: [{ x: rival, y: disc, s: 'Discount %' }, { x: 'Paper Boat', y: disc - 18, s: 'Discount %' }],
      chartTitle: 'Average discount, %',
    }, 30 + i * 6));
  }

  // --- Forecast
  {
    const a = anchor();
    const w = where();
    const up = intBetween(r, 18, 38);
    const line = a?.line ?? 'Swing';
    const city = a?.city && cities.includes(a.city) ? a.city : w.city;
    out.push(mk({
      type: 'Forecast', severity: 'medium', platform: a?.platform ?? w.platform, city, product: line, metric: 'Forecast 4 wk', delta: `+${up}%`, rule: 'Forecast uplift ≥ 15% over baseline',
      title: `${line} demand forecast +${up}% in ${city} over the next 4 weeks`,
      detail: `Temperature and festival calendar lift the forecast. Current cover may fall short of the peak; consider raising the allocation.`,
      impactInr: intBetween(r, 90, 210) * 1000,
      evidence: [{ label: 'Product line', value: line }, { label: 'Uplift vs baseline', value: `+${up}%` }, { label: 'Horizon', value: '4 weeks' }, { label: 'Model WAPE', value: '11.4%' }],
      hyp: [{ k: 'yes', t: 'Temperature effect validated in backtest', n: 'Improves WAPE from 17.8% to 11.4%' }, { k: 'unk', t: 'Festival uplift', n: 'One prior season observed' }],
      actions: [{ t: `Increase ${city} allocation of ${line} for the peak`, mode: 'Approve', owner: 'Supply planner' }],
      chart: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'].flatMap((x, k) => [{ x, y: 3100 + k * 20, s: 'Baseline' }, { x, y: Math.round(3100 * (1 + (up / 100) * ((k + 1) / 4))), s: 'Forecast' }]),
      chartTitle: 'Weekly units, baseline vs forecast (sample)',
    }, 44));
  }

  // --- Media
  {
    const w = where();
    const roas = (1.2 + r() * 0.6).toFixed(1);
    out.push(mk({
      type: 'Media', severity: 'medium', platform: w.platform, city: w.city, metric: 'ROAS 7 d', delta: `${roas}×`, rule: 'ROAS < 2.0 for 7 days',
      title: `${platformLabel(w.platform)} sponsored ROAS fell to ${roas}× in ${w.city}`,
      detail: `ROAS slid from 2.9× to ${roas}× over seven days while some promoted listings were out of stock.`,
      impactInr: intBetween(r, 60, 120) * 1000, status: 'Acknowledged',
      evidence: [{ label: 'ROAS 7 d', value: `${roas}×` }, { label: 'ROAS 7 d ago', value: '2.9×' }, { label: 'Spend (month)', value: '₹3.5 L' }],
      hyp: [{ k: 'yes', t: 'Promoted listings out of stock', n: 'Overlaps with availability signals' }, { k: 'no', t: 'Bid inflation', n: 'CPC flat' }],
      actions: [{ t: 'Pause campaigns on out-of-stock listings', mode: 'Approve', owner: 'Retail media manager' }],
      chart: [2.9, 2.6, 2.1, 1.8, 1.6, 1.5, Number(roas)].map((y, k) => ({ x: `D-${6 - k}`, y, s: 'ROAS' })),
      chartTitle: 'ROAS, last 7 days (sample)',
    }, 52));
  }

  // --- Inventory & expiry (CFA — not observable from the shelf)
  {
    const a = anchor();
    const w = where();
    const days = intBetween(r, 30, 45);
    out.push(mk({
      type: 'Inventory & expiry', severity: 'medium', platform: w.platform, city: a?.city && cities.includes(a.city) ? a.city : w.city, product: a?.label, metric: 'Days of cover', delta: `${days} d`, rule: 'Cover exceeds remaining shelf life',
      title: `${a?.label ?? 'A SKU'}: ${days} days of cover against 38 days to expiry`,
      detail: 'Warehouse cover exceeds remaining shelf life at current velocity. A transfer to a faster-selling city clears the risk.',
      impactInr: intBetween(r, 120, 230) * 1000,
      evidence: [{ label: 'Days of cover', value: `${days}` }, { label: 'Days to expiry', value: '38' }, { label: 'Source', value: 'CFA stock report (sample)' }],
      hyp: [{ k: 'yes', t: 'Over-allocation last month', n: 'Sell-in ahead of sell-out' }],
      actions: [{ t: 'Transfer surplus units to a faster-selling city', mode: 'Approve', owner: 'Supply planner' }],
      chart: [{ x: 'Days of cover', y: days, s: 'Days' }, { x: 'Days to expiry', y: 38, s: 'Days' }],
      chartTitle: 'Cover vs expiry (sample)',
    }, 60));
  }

  // --- a couple already resolved, for the 7-day tile
  for (let i = 0; i < 2; i++) {
    const w = where();
    out.push(mk({
      type: i ? 'Availability' : 'Pricing', severity: 'low', platform: w.platform, city: w.city, metric: i ? 'Buyable' : 'Discount', delta: i ? 'recovered' : '-4 pts', rule: 'Closed by owner',
      title: i ? `${w.city}: 2 offers back in stock after replenishment` : `Discount pulled back on a Swing pack in ${w.city}`,
      detail: 'Verified on the next capture and closed by the owner.', status: 'Resolved',
      evidence: [{ label: 'Resolved by', value: 'Owner' }, { label: 'Time to resolve', value: `${1 + i} d` }],
      hyp: [{ k: 'yes', t: 'Transient change', n: 'Recovered within 24 h' }], actions: [],
      timeline: [{ at: addH(capturedAt, -90 - i * 10), tone: 'act', text: 'Signal generated' }, { at: addH(capturedAt, -50 - i * 10), tone: 'ok', text: 'Verified on the next capture — resolved' }],
    }, 90 + i * 10));
  }
  return out;
}

export const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const SEVERITY_BANDS: { sev: Severity; rule: string }[] = [
  { sev: 'critical', rule: 'Out of stock for 5+ consecutive captures, or buyable share below 50%' },
  { sev: 'high', rule: 'Out of stock for 3-4 captures, city price gap ≥ 15%, sell-out swing ≥ 40%' },
  { sev: 'medium', rule: 'Out of stock for 2 captures, discount move ≥ 8 pts, city price gap ≥ 5%' },
  { sev: 'low', rule: 'Restock, small discount move, data-quality notes' },
];
