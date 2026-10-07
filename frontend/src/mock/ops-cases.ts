/**
 * Decision / value-case model shared by Inbox and Value & Outcomes.
 * The TRIGGER of a case is anchored to the real capture when possible (real signals, not-listed
 * listings, real products and prices). Approval, execution, readback and outcome are SAMPLE: no
 * intervention has been executed yet.
 */
import { platformLabel } from '@/lib/config';
import type { Signal, Snapshot } from '@/lib/types';
import { addD, type Anchor, dayDiff, hash, intBetween, pickOf, productLabel, rng } from '@/mock/ops-common';

export const FLOW = [
  { key: 'prepared', label: 'Prepared' },
  { key: 'approved', label: 'Approved' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'verified', label: 'Verified' },
  { key: 'measured', label: 'Outcome measured' },
] as const;
export const STATE_LABEL = (step: number) => (step < 0 ? 'Rejected' : FLOW[step].label);
export const KINDS = [
  { key: 'oos_recovery', label: 'Out-of-stock recovery' },
  { key: 'price_parity', label: 'Price parity correction' },
  { key: 'assortment_gap', label: 'Assortment gap · new listing' },
  { key: 'shelf_absence', label: 'Shelf absence · term mapping' },
  { key: 'promo_review', label: 'Discount depth review' },
] as const;
export type CaseKind = (typeof KINDS)[number]['key'];
export const kindLabel = (k: string) => KINDS.find((x) => x.key === k)?.label ?? k;

export const ASSUMPTIONS = { unitsPerListingDay: 18, windowDays: 14, opsRate: 1100, staleAfterDays: 14, dueDays: 10 };
export const OWNERS_POOL = ['Key account manager', 'Revenue growth manager', 'Catalogue manager', 'Supply planner', 'Marketplace ops', 'Head of e-commerce'];

export interface OpsCase {
  id: string;
  kind: CaseKind;
  title: string;
  observed: string;
  platform: string;
  city: string;
  product: string | null;
  step: number; // -1 rejected, 0..5
  closed: boolean;
  sent: boolean; // sent for approval from Value & Outcomes
  chased: number;
  owner: string;
  preparedBy: string;
  approvedBy: string;
  priority: 'P1' | 'P2' | 'P3';
  raisedAt: string; // yyyy-mm-dd
  dueAt: string;
  guard: 'Valid' | 'Stale';
  real: boolean;
  signalId: string | null;
  evidence: { label: string; value: string }[];
  evidenceCount: number;
  rowFilter: { avail?: 'out_of_stock' | 'not_listed'; product?: string };
  limits: string;
  route: { mode: string; endpoint: string; submittedAt: string | null; acknowledgedAt: string | null; ref: string | null };
  readback: { field: string; unit: string; before: number; after: number | null; verifiedAt: string | null };
  outcome: { metric: string; baseline: number; comparison: number | null; measuredAt: string | null; claimedInr: number; verifiedInr: number; costInr: number; basis: string };
  history: { step: string; at: string; by: string }[];
}

const KIND_META: Record<CaseKind, { owner: (p: string) => string; field: string; unit: string; endpoint: string; factor: number; limits: string }> = {
  oos_recovery: { owner: (p) => `Key account · ${platformLabel(p)}`, field: 'in_stock', unit: 'listings', endpoint: 'Inventory & fulfilment console', factor: 1, limits: 'Max 2,400 units · ₹1.8 L · price change not permitted' },
  price_parity: { owner: () => 'Revenue growth manager', field: 'offer_price', unit: '₹', endpoint: 'Pricing & promotions console', factor: 0.25, limits: 'Price move within ±5% of MRP corridor' },
  assortment_gap: { owner: (p) => `Key account · ${platformLabel(p)}`, field: 'listed_cities', unit: 'cities', endpoint: 'Catalogue & listing portal', factor: 0.6, limits: 'New listing request · no price commitment' },
  shelf_absence: { owner: () => 'Catalogue manager', field: 'paperboat_results', unit: 'results', endpoint: 'Catalogue & search-term mapping', factor: 0.4, limits: 'Content and term mapping only' },
  promo_review: { owner: () => 'Revenue growth manager', field: 'discount_pct', unit: 'pts', endpoint: 'Pricing & promotions console', factor: 0.2, limits: 'Discount depth within agreed trade terms' },
};
const STEP_OFFSETS = [0, 2, 2, 2, 5, 3]; // days between consecutive steps
const cum = (step: number) => STEP_OFFSETS.slice(0, step + 1).reduce((a, b) => a + b, 0);
// distribution of states used for the sample cases (mirrors the reference ledger)
const SAMPLE_STEPS = [5, 0, -1, 2, 5, 4, 5, 3, 2, 1, 1, 3, 4, 5, 5, 0, -1, 2, 4, 4, 5, 3, 2, 1];
const HISTORY_ACTOR = ['Agent · availability watch', 'Head of e-commerce', '', 'Platform account team', 'Scheduled capture · readback', 'Outcome measurement'];

interface Input {
  signals: Signal[];
  latest: Snapshot[];
  anchors: Anchor[];
  platforms: string[];
  cities: string[];
  capturedAt: string;
}

function finish(c: Omit<OpsCase, 'history' | 'route' | 'readback' | 'outcome' | 'dueAt' | 'guard' | 'owner' | 'approvedBy' | 'limits' | 'priority' | 'closed' | 'sent' | 'chased'> & { price: number; affected: number; today: string }): OpsCase {
  const { price, affected, today, ...base } = c;
  const r = rng(`${base.id}|fin`);
  const meta = KIND_META[base.kind];
  const step = base.step;
  const upTo = step < 0 ? 0 : step;
  const dates = FLOW.map((_, i) => addD(base.raisedAt, cum(i)));
  const history: { step: string; at: string; by: string }[] = FLOW.slice(0, upTo + 1).map((f, i) => ({ step: f.key, at: dates[i], by: i === 0 ? base.preparedBy : i === 1 ? 'Head of e-commerce' : i === 2 ? meta.owner(base.platform) : HISTORY_ACTOR[i] }));
  if (step < 0) history.push({ step: 'rejected', at: addD(base.raisedAt, 2), by: 'Head of e-commerce' });
  const claimed = Math.round(affected * ASSUMPTIONS.unitsPerListingDay * ASSUMPTIONS.windowDays * price * meta.factor);
  const verifiedInr = step >= 5 ? Math.round(claimed * (0.4 + r() * 0.55)) : 0;
  const hours = Math.round((1.5 + r() * 5) * 10) / 10;
  const readBefore = Math.max(1, Math.round(10 + r() * 40));
  const age = dayDiff(base.raisedAt, today);
  const submitted = step >= 2 ? dates[2] : null;
  const ackd = step >= 3 ? dates[3] : step === 2 && r() < 0.3 ? null : null;
  const noRef = step === 2 && r() < 0.35;
  return {
    ...base,
    owner: meta.owner(base.platform),
    approvedBy: 'Head of e-commerce',
    priority: r() < 0.3 ? 'P1' : r() < 0.7 ? 'P2' : 'P3',
    dueAt: addD(base.raisedAt, ASSUMPTIONS.dueDays),
    guard: age > ASSUMPTIONS.staleAfterDays && step <= 1 && step >= 0 ? 'Stale' : 'Valid',
    closed: false,
    sent: false,
    chased: 0,
    limits: meta.limits,
    route: { mode: 'Seller portal · assisted', endpoint: meta.endpoint, submittedAt: submitted, acknowledgedAt: ackd, ref: submitted && !noRef ? `${base.platform.slice(0, 3).toUpperCase()}-CHG-${10000 + (hash(base.id) % 9000)}` : null },
    readback: { field: meta.field, unit: meta.unit, before: readBefore, after: step >= 4 ? readBefore + affected : null, verifiedAt: step >= 4 ? dates[4] : null },
    outcome: {
      metric: `${meta.field} · ${platformLabel(base.platform)} ${base.city}`, baseline: readBefore, comparison: step >= 5 ? readBefore + affected : null, measuredAt: step >= 5 ? dates[5] : null,
      claimedInr: claimed, verifiedInr, costInr: Math.round(hours * ASSUMPTIONS.opsRate),
      basis: `${affected} affected × ${ASSUMPTIONS.unitsPerListingDay} assumed units/day × ${ASSUMPTIONS.windowDays} d × ₹${Math.round(price)} observed price × ${meta.factor} kind factor`,
    },
    history,
  };
}

export function buildCases({ signals, latest, anchors, platforms, cities, capturedAt }: Input): OpsCase[] {
  if (!capturedAt || !platforms.length || !cities.length) return [];
  const today = capturedAt.slice(0, 10);
  const out: OpsCase[] = [];
  let n = 2000;
  const nid = () => `VC-${++n}`;
  const priceOf = (city: string, product?: string | null) => anchors.find((a) => a.city === city && (!product || a.label === product))?.price ?? anchors[0]?.price ?? 60;

  // ---- REAL triggers: signals and not-listed listings from the capture (fresh, early in the loop)
  const realSig = signals.filter((s) => (s.type === 'Availability' && /out of stock/.test(s.title)) || s.metric === 'City price gap' || s.metric === 'Discount').slice(0, 8);
  realSig.forEach((s, i) => {
    const kind: CaseKind = s.metric === 'City price gap' ? 'price_parity' : s.metric === 'Discount' ? 'promo_review' : 'oos_recovery';
    const city = s.city.split(' + ')[0];
    const step = i % 5 === 4 ? 2 : i % 3 === 2 ? 1 : 0;
    const age = cum(step) + (i % 3);
    out.push(finish({
      id: nid(), kind, title: s.title, observed: s.detail, platform: s.platform, city: s.city, product: s.product ?? null, step, raisedAt: addD(today, -age), real: true, signalId: s.id,
      preparedBy: 'Agent · availability watch', evidenceCount: 1,
      evidence: [{ label: 'Rule', value: s.rule }, { label: s.metric, value: s.delta }, { label: 'Confidence', value: `${s.confidence}%` }, { label: 'Detected', value: s.detected_at.slice(0, 16).replace('T', ' ') + ' UTC' }],
      rowFilter: { avail: kind === 'oos_recovery' ? 'out_of_stock' : undefined, product: s.product },
      price: priceOf(city, s.product), affected: kind === 'oos_recovery' ? 1 : 2, today,
    }));
  });
  const nl = new Map<string, { platform: string; city: string; n: number }>();
  latest.filter((s) => s.availability === 'not_listed').forEach((s) => {
    const k = `${s.platform}|${s.city}`;
    nl.set(k, { platform: s.platform, city: s.city, n: (nl.get(k)?.n ?? 0) + 1 });
  });
  Array.from(nl.values()).slice(0, 3).forEach((g, i) => {
    out.push(finish({
      id: nid(), kind: 'assortment_gap', title: `${g.n} Paper Boat products not listed on ${platformLabel(g.platform)} ${g.city}`, observed: `${g.n} products in the Paper Boat range return no listing for this pincode while they are listed elsewhere.`,
      platform: g.platform, city: g.city, product: null, step: i === 0 ? 1 : 0, raisedAt: addD(today, -(i + 1)), real: true, signalId: null, preparedBy: 'Agent · availability watch', evidenceCount: g.n,
      evidence: [{ label: 'Products not listed', value: String(g.n) }, { label: 'Platform', value: platformLabel(g.platform) }, { label: 'City', value: g.city }],
      rowFilter: { avail: 'not_listed' }, price: priceOf(g.city), affected: Math.min(g.n, 6), today,
    }));
  });

  // ---- SAMPLE history: fill the loop (approved … measured) on real products and prices
  const kinds = KINDS.map((k) => k.key);
  const target = Math.max(18, out.length + 12);
  for (let i = 0; out.length < target; i++) {
    const r = rng(`case|${platforms.join()}|${cities.join()}|${i}`);
    const kind = kinds[i % kinds.length];
    const platform = pickOf(r, platforms);
    const city = pickOf(r, cities);
    const a = anchors.length ? pickOf(r, anchors.filter((x) => x.platform === platform && x.city === city).length ? anchors.filter((x) => x.platform === platform && x.city === city) : anchors) : undefined;
    const step = SAMPLE_STEPS[i % SAMPLE_STEPS.length];
    const affected = intBetween(r, 2, 9);
    const age = (step < 0 ? 4 : cum(step)) + intBetween(r, 1, 4) + (step === 0 && i % 7 === 0 ? 14 : 0);
    const label = a?.label ?? 'Swing range';
    const titles: Record<CaseKind, string> = {
      oos_recovery: `${affected} Paper Boat listings out of stock · ${platformLabel(platform)} ${city}`,
      price_parity: `${label} priced apart across cities · ${platformLabel(platform)}`,
      assortment_gap: `${label} missing on ${platformLabel(platform)} ${city}`,
      shelf_absence: `No Paper Boat result for "${pickOf(r, ['fruit juice', 'mango drink', 'coconut water'])}" · ${platformLabel(platform)} ${city}`,
      promo_review: `${label} discounted deeper than the corridor · ${platformLabel(platform)} ${city}`,
    };
    out.push(finish({
      id: nid(), kind, title: titles[kind], observed: `${titles[kind]}. Trigger sampled from the shelf; execution and outcome are sample data.`, platform, city, product: a?.label ?? null, step, raisedAt: addD(today, -age), real: false, signalId: null,
      preparedBy: HISTORY_ACTOR[0], evidenceCount: affected,
      evidence: [{ label: 'Affected', value: String(affected) }, { label: 'Median offer price', value: `₹${Math.round(a?.price ?? 60)}` }, { label: 'Anchored product', value: label }],
      rowFilter: { avail: kind === 'oos_recovery' ? 'out_of_stock' : kind === 'assortment_gap' ? 'not_listed' : undefined, product: kind === 'oos_recovery' ? undefined : a?.label },
      price: a?.price ?? 60, affected, today,
    }));
  }
  return out;
}

// ---------------------------------------------------------------- actions (pure)
const refFor = (c: OpsCase) => `${c.platform.slice(0, 3).toUpperCase()}-CHG-${10000 + (hash(c.id + 'x') % 9000)}`;
export const needsYou = (c: OpsCase) => c.step === 0 || c.step === 1;
export const isOverdue = (c: OpsCase, today: string) => c.step >= 0 && c.step <= 3 && c.dueAt < today;
export const bucketOf = (c: OpsCase): 'todo' | 'platform' | 'verified' | 'closed' => (c.step < 0 || c.step === 5 ? 'closed' : c.step <= 1 ? 'todo' : c.step <= 3 ? 'platform' : 'verified');

export function approveAndSubmit(c: OpsCase, today: string): OpsCase {
  if (c.step > 1 || c.step < 0) return c;
  const h = [...c.history];
  if (c.step === 0) h.push({ step: 'approved', at: today, by: c.approvedBy });
  h.push({ step: 'submitted', at: today, by: c.owner });
  return { ...c, step: 2, guard: 'Valid', history: h, route: { ...c.route, submittedAt: today, ref: c.route.ref ?? refFor(c) } };
}
export function approveOnly(c: OpsCase, today: string): OpsCase {
  return c.step === 0 ? { ...c, step: 1, history: [...c.history, { step: 'approved', at: today, by: c.approvedBy }] } : c;
}
export function submitToPlatform(c: OpsCase, today: string): OpsCase {
  return c.step === 1 ? approveAndSubmit(c, today) : c;
}
export function requestReadback(c: OpsCase, today: string): OpsCase {
  if (c.step < 2 || c.step > 3) return c;
  const h = [...c.history];
  if (c.step === 2) h.push({ step: 'acknowledged', at: today, by: 'Platform account team' });
  h.push({ step: 'verified', at: today, by: 'Scheduled capture · readback' });
  const gain = Math.max(1, c.evidenceCount);
  return { ...c, step: 4, history: h, route: { ...c.route, acknowledgedAt: c.route.acknowledgedAt ?? today }, readback: { ...c.readback, after: c.readback.before + gain, verifiedAt: today } };
}
export function measureOutcome(c: OpsCase, today: string): OpsCase {
  if (c.step !== 4) return c;
  const r = rng(`${c.id}|measure`);
  return {
    ...c, step: 5, history: [...c.history, { step: 'measured', at: today, by: 'Outcome measurement' }],
    outcome: { ...c.outcome, measuredAt: today, comparison: (c.readback.after ?? c.readback.before) + 0, verifiedInr: Math.round(c.outcome.claimedInr * (0.4 + r() * 0.55)) },
  };
}
export const closeCase = (c: OpsCase): OpsCase => ({ ...c, closed: true });
export const rejectCase = (c: OpsCase, today: string): OpsCase => (c.step >= 0 && c.step <= 1 ? { ...c, step: -1, history: [...c.history, { step: 'rejected', at: today, by: c.approvedBy }] } : c);
export const reopenCase = (c: OpsCase): OpsCase => (c.step < 0 ? { ...c, step: 0, history: c.history.filter((h) => h.step !== 'rejected'), sent: false } : c);
export const reassignCase = (c: OpsCase, owner: string): OpsCase => ({ ...c, owner });

export function nextActionLabel(c: OpsCase): string {
  if (c.step < 0) return 'Re-open for approval';
  if (c.step === 0) return c.sent ? 'Awaiting approval' : 'Send for approval';
  if (c.step === 1) return 'Submit to platform';
  if (c.step <= 3) return 'Request readback';
  if (c.step === 4) return 'Measure outcome';
  return c.closed ? 'Closed' : 'Close case';
}
export function applyNext(c: OpsCase, today: string): OpsCase {
  if (c.step < 0) return reopenCase(c);
  if (c.step === 0) return c.sent ? c : { ...c, sent: true };
  if (c.step === 1) return submitToPlatform(c, today);
  if (c.step <= 3) return requestReadback(c, today);
  if (c.step === 4) return measureOutcome(c, today);
  return closeCase(c);
}

export function stepAt(c: OpsCase, key: string) { return c.history.find((h) => h.step === key)?.at ?? null; }
export function daysToVerify(c: OpsCase) { const v = stepAt(c, 'verified'); return v ? dayDiff(c.raisedAt, v) : null; }
export { productLabel };
