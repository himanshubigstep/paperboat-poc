/** Sample (seeded, static) data for the Home page: everything the shelf capture cannot prove. */
import { hash, rng } from '@/mock/dashboard-a';

export interface AlertRule { id: string; name: string; module: string; owner: string; severity: 'critical' | 'high'; matches: number; population: number; unit: string }
/** `oos` is the real count of out-of-stock listings, so the first rule moves with the data */
export function alertRules(oos: number, listings: number): AlertRule[] {
  return [
    { id: 'r1', name: 'Buyable availability below 90% on a platform × city', module: 'Availability', owner: 'Supply planner', severity: 'critical', matches: oos, population: listings, unit: 'listings out of stock' },
    { id: 'r2', name: 'Same pack priced >10% apart across cities', module: 'Pricing', owner: 'Category manager', severity: 'high', matches: 4, population: 51, unit: 'SKUs' },
    { id: 'r3', name: 'No Paper Boat result on a category shelf', module: 'Search', owner: 'Retail media manager', severity: 'high', matches: 9, population: 64, unit: 'category shelves' },
  ];
}

export interface Approval { id: string; title: string; sub: string; who: string; when: string; overdue?: boolean }
export const APPROVALS: Approval[] = [
  { id: 'a1', title: 'Restock request for out-of-stock listings', sub: 'Stock rebalancing · prepared from the latest capture', who: 'Supply planner', when: 'Due today 18:00' },
  { id: 'a2', title: 'Hold discount on Swing 600 ml until velocity is verified', sub: 'Price guard · reversible', who: 'Category manager', when: 'Due today 14:00' },
  { id: 'a3', title: 'Decide how to treat listings with no stock flag', sub: 'Data decision · changes every availability number', who: 'Marketing admin', when: 'Overdue by 1 day', overdue: true },
];

export interface Workflow { name: string; does: string; runs30d: number; success: number }
export const WORKFLOWS: Workflow[] = [
  { name: 'Availability recovery', does: 'Prepares a decision for a person', runs30d: 90, success: 98.9 },
  { name: 'Price & promo tracker', does: 'Recommends, does not act', runs30d: 90, success: 100 },
  { name: 'Search rank watch', does: 'Recommends, does not act', runs30d: 30, success: 96.7 },
  { name: 'Stock rebalancing', does: 'Prepares a decision for a person', runs30d: 30, success: 100 },
  { name: 'Content fix queue', does: 'Runs within its bounds', runs30d: 60, success: 98.3 },
];
export const RUNS_24H = { runs: 17, okPct: 94, waiting: 3, failed: 1 };

export interface Report { title: string; sub: string; ready: boolean }
export const REPORTS: Report[] = [
  { title: 'CMO Monday brief', sub: 'Scheduled weekly · PDF · 6 pages', ready: true },
  { title: 'Availability exceptions', sub: 'Daily · listings not buyable', ready: true },
  { title: 'Competitive response brief', sub: 'AI-generated · reviewed by the category manager', ready: true },
  { title: 'Search visibility review', sub: 'Scheduled monthly · 44 keywords', ready: false },
];

export const VALUE = { cases: 41, kinds: 5, verifiedInr: 412000, netVerifiedInr: 376000, claimedOpenInr: 268000, medianDays: 6, funnel: { recommended: 41, approved: 33, executed: 29, verified: 22, measured: 18 }, overdue: 3, windowDays: 30 };

/** seeded wiggle for platform-level sample numbers on Home */
export const homeSeed = (key: string, lo: number, hi: number) => lo + rng(hash(key))() * (hi - lo);
