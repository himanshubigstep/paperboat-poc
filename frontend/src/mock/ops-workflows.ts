/**
 * Workflow Monitoring model. The shelf-capture workflow is REAL-ish: one run per capture x platform x city,
 * with rows captured and first/last scraped_at taken from the dataset. Every other workflow is SAMPLE.
 */
import { CONNECTED_CITIES, CONNECTED_PLATFORMS, platformLabel } from '@/lib/config';
import type { Snapshot } from '@/lib/types';
import { addH, intBetween, rng } from '@/mock/ops-common';

export type RunStatus = 'Success' | 'Failed' | 'Running' | 'Waiting approval' | 'Partial';
export type FixKind = 'retry' | 'mapping' | 'gap' | 'approval';
export type Sched = { kind: 'slots'; istMin: number[] } | { kind: 'every'; h: number } | { kind: 'daily'; istMin: number } | { kind: 'weekly'; dow: number; istMin: number };

export interface WfDef {
  id: string;
  name: string;
  scheduleLabel: string;
  sched: Sched;
  version: string;
  autonomy: 'Recommend' | 'Approve' | 'Auto (bounded)';
  runs30d: number;
  signals30d: number;
  real: boolean;
  steps: string[];
}
export interface Run {
  id: string;
  wf: string;
  workflow: string;
  trigger: 'Schedule' | 'Manual';
  started: string;
  durationS: number;
  status: RunStatus;
  nodes: number;
  failedNodes: number;
  signals: number;
  real: boolean;
  scope?: string;
  rows?: number;
  firstAt?: string;
  lastAt?: string;
  error?: { stoppedAt: string; message: string; fix: FixKind };
  stepTimes: { name: string; s: number; ok: boolean }[];
}

export const WF_CAPTURE = 'wf-10';
const IST = 330; // minutes

export const WORKFLOWS: WfDef[] = [
  { id: 'wf-01', name: 'Availability recovery', scheduleLabel: 'Every 6 h', sched: { kind: 'every', h: 6 }, version: 'v3', autonomy: 'Approve', runs30d: 120, signals30d: 27, real: false, steps: ['Read latest capture', 'Compare with prior captures', 'Rule: out of stock ≥ 2 captures', 'Create signal', 'Draft action', 'Approval'] },
  { id: 'wf-02', name: 'Search rank watch', scheduleLabel: 'Daily 07:00', sched: { kind: 'daily', istMin: 420 }, version: 'v5', autonomy: 'Recommend', runs30d: 30, signals30d: 14, real: false, steps: ['Read search ranks', 'Compare share of search', 'Rule: rank outside top 8', 'Create signal'] },
  { id: 'wf-03', name: 'Competitor price & promo tracker', scheduleLabel: 'Daily 06:30', sched: { kind: 'daily', istMin: 390 }, version: 'v2', autonomy: 'Recommend', runs30d: 30, signals30d: 9, real: false, steps: ['Read dataset', 'Map columns', 'Compute rival discount gap', 'Create signal'] },
  { id: 'wf-04', name: 'Availability-aware media guard', scheduleLabel: 'Every 12 h', sched: { kind: 'every', h: 12 }, version: 'v4', autonomy: 'Approve', runs30d: 60, signals30d: 6, real: false, steps: ['Read spend', 'Join availability', 'Rule: spend on out-of-stock', 'Draft pause'] },
  { id: 'wf-05', name: 'Dead-stock & expiry sentinel', scheduleLabel: 'Daily 05:00', sched: { kind: 'daily', istMin: 300 }, version: 'v1', autonomy: 'Approve', runs30d: 30, signals30d: 4, real: false, steps: ['Read CFA stock', 'Cover vs shelf life', 'Create signal'] },
  { id: 'wf-06', name: 'Stock rebalancing planner', scheduleLabel: 'Weekly Mon 06:00', sched: { kind: 'weekly', dow: 1, istMin: 360 }, version: 'v2', autonomy: 'Approve', runs30d: 4, signals30d: 3, real: false, steps: ['Read cover by city', 'Optimise transfers', 'Draft plan'] },
  { id: 'wf-07', name: 'Demand forecast refresh', scheduleLabel: 'Weekly Sun 22:00', sched: { kind: 'weekly', dow: 0, istMin: 1320 }, version: 'v6', autonomy: 'Auto (bounded)', runs30d: 4, signals30d: 2, real: false, steps: ['Load history', 'Fit model', 'Backtest', 'Publish forecast'] },
  { id: 'wf-08', name: 'Data quality & freshness monitor', scheduleLabel: 'Every hour', sched: { kind: 'every', h: 1 }, version: 'v2', autonomy: 'Auto (bounded)', runs30d: 720, signals30d: 5, real: false, steps: ['Check freshness', 'Check completeness', 'Check schema', 'Create signal'] },
  { id: 'wf-09', name: 'CMO Monday brief', scheduleLabel: 'Weekly Mon 07:30', sched: { kind: 'weekly', dow: 1, istMin: 450 }, version: 'v3', autonomy: 'Auto (bounded)', runs30d: 4, signals30d: 0, real: false, steps: ['Collect KPIs', 'Write brief', 'Send'] },
  { id: WF_CAPTURE, name: 'Shelf capture', scheduleLabel: '3 a day · 06:00, 12:00, 20:00 IST', sched: { kind: 'slots', istMin: [360, 720, 1200] }, version: 'v7', autonomy: 'Auto (bounded)', runs30d: 90, signals30d: 0, real: true, steps: ['Open session', 'Scrape listings', 'Parse rows', 'Store snapshot', 'Verify counts'] },
];

/** All schedule occurrences (ISO UTC) from `from` to `to`. */
export function occurrences(s: Sched, fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const dayMs = 86400_000;
  const istStart = Math.floor((from + IST * 60_000) / dayMs) * dayMs;
  for (let t = istStart; t <= to + IST * 60_000 + dayMs; t += dayMs) {
    const dow = new Date(t).getUTCDay();
    const mins: number[] = s.kind === 'slots' ? s.istMin : s.kind === 'every' ? Array.from({ length: Math.floor(24 / s.h) }, (_, i) => i * s.h * 60) : s.kind === 'daily' ? [s.istMin] : s.dow === dow ? [s.istMin] : [];
    mins.forEach((m) => {
      const ms = t + m * 60_000 - IST * 60_000;
      if (ms >= from && ms <= to) out.push(new Date(ms).toISOString());
    });
  }
  return out.sort();
}

interface Input {
  snapshots: Snapshot[];
  captures: string[];
  platforms: string[];
  cities: string[];
  capturedAt: string;
  wfFilter?: undefined;
}

export function buildRuns({ snapshots, captures, platforms, cities, capturedAt }: Input): Run[] {
  if (!capturedAt) return [];
  const runs: Run[] = [];
  let n = 9000;
  const wfName = (id: string) => WORKFLOWS.find((w) => w.id === id)?.name ?? id;

  // ---- REAL: capture runs per capture x platform x city (last 3 days of captures)
  const pairs = platforms.filter((p) => CONNECTED_PLATFORMS.some((c) => c.id === p)).flatMap((p) => cities.filter((c) => CONNECTED_CITIES.some((x) => x.id === c)).map((c) => ({ p, c })));
  const recent = captures.slice(-9);
  const bucket = new Map<string, Snapshot[]>();
  snapshots.forEach((s) => {
    if (!recent.includes(s.capture_id)) return;
    const k = `${s.capture_id}|${s.platform}|${s.city}`;
    (bucket.get(k) ?? bucket.set(k, []).get(k)!).push(s);
  });
  recent.forEach((cap) => {
    pairs.forEach(({ p, c }) => {
      const rows = bucket.get(`${cap}|${p}|${c}`);
      if (!rows?.length) return;
      const times = rows.map((r) => Date.parse(r.scraped_at));
      const first = Math.min(...times);
      const last = Math.max(...times);
      const durationS = Math.max(30, Math.round((last - first) / 1000));
      const listed = rows.filter((r) => r.availability !== 'not_listed').length;
      const r = rng(`${cap}|${p}|${c}`);
      const startedMs = first - 20_000;
      const scrape = Math.round(durationS * 0.78);
      runs.push({
        id: `run-${++n}`, wf: WF_CAPTURE, workflow: wfName(WF_CAPTURE), trigger: 'Schedule', started: new Date(startedMs).toISOString(), durationS: durationS + 20,
        status: listed < rows.length * 0.5 ? 'Partial' : 'Success', nodes: 5, failedNodes: 0, signals: 0, real: true, scope: `${platformLabel(p)} · ${c}`, rows: rows.length,
        firstAt: new Date(first).toISOString(), lastAt: new Date(last).toISOString(),
        stepTimes: [{ name: 'Open session', s: 8 + intBetween(r, 0, 5), ok: true }, { name: 'Scrape listings', s: scrape, ok: true }, { name: 'Parse rows', s: Math.round(durationS * 0.1), ok: true }, { name: 'Store snapshot', s: Math.round(durationS * 0.08), ok: true }, { name: 'Verify counts', s: 4, ok: true }],
      });
    });
  });

  // ---- SAMPLE: every other workflow over the last 7 days
  const from = addH(capturedAt, -7 * 24);
  WORKFLOWS.filter((w) => !w.real).forEach((w) => {
    let occ = occurrences(w.sched, from, capturedAt);
    if (w.sched.kind === 'every' && w.sched.h === 1) occ = occ.slice(-24);
    occ.forEach((at, i) => {
      const r = rng(`${w.id}|${at}`);
      const isLast = i === occ.length - 1;
      const dur = intBetween(r, 14, 240);
      runs.push({
        id: `run-${++n}`, wf: w.id, workflow: w.name, trigger: r() < 0.08 ? 'Manual' : 'Schedule', started: at, durationS: dur, status: 'Success', nodes: w.steps.length, failedNodes: 0,
        signals: r() < 0.25 ? intBetween(r, 1, 3) : 0, real: false,
        stepTimes: w.steps.map((name) => ({ name, s: Math.max(1, Math.round(dur / w.steps.length + intBetween(r, -4, 6))), ok: true })),
        ...(isLast && w.id === 'wf-01' ? { status: 'Waiting approval' as RunStatus, error: { stoppedAt: 'Approval · Supply planner', message: 'Waiting for a person for more than 8 hours, which breaches the agreed response time. The stock move has not been submitted.', fix: 'approval' as FixKind } } : {}),
        ...(isLast && w.id === 'wf-07' ? { status: 'Running' as RunStatus } : {}),
      });
    });
  });
  // two seeded failures
  const failAt = (wfId: string, daysBack: number, stoppedAt: string, message: string, fix: FixKind) => {
    const w = WORKFLOWS.find((x) => x.id === wfId)!;
    const occ = occurrences(w.sched, from, capturedAt);
    const idx = Math.max(0, occ.length - 1 - daysBack);
    const target = runs.find((r) => r.wf === wfId && r.started === occ[idx]);
    if (!target) return;
    target.status = 'Failed';
    target.failedNodes = 1;
    target.error = { stoppedAt, message, fix };
    target.stepTimes = target.stepTimes.map((s, i) => (i === Math.min(1, target.stepTimes.length - 1) ? { ...s, ok: false } : s));
  };
  failAt('wf-03', 1, 'Read dataset', 'A column the workflow needs was renamed in the competitor benchmark dataset (avg_offer_price). The run stopped before writing anything.', 'mapping');
  failAt('wf-08', 3, 'Check completeness', 'The completeness probe timed out. Hourly checks resumed on the next run; the gap in the freshness log remains.', 'gap');
  failAt('wf-04', 2, 'Join availability', 'The spend feed returned an empty file for one hour. Nothing was written downstream.', 'retry');
  return runs.sort((a, b) => (a.started < b.started ? 1 : -1)).map((r, i, all) => ({ ...r, id: `run-${9000 + all.length - i}` }));
}
