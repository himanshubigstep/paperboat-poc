/** Shared helpers for the operations pages (signals, inbox, workflows, alerts, value). Deterministic — no Math.random / Date.now. */
import type { Snapshot } from '@/lib/types';

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rng(seed: number | string) {
  let s = (typeof seed === 'string' ? hash(seed) : seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rnd = () => number;
export const pickOf = <T,>(r: Rnd, arr: T[]): T => arr[Math.floor(r() * arr.length) % arr.length];
export const between = (r: Rnd, lo: number, hi: number) => lo + r() * (hi - lo);
export const intBetween = (r: Rnd, lo: number, hi: number) => Math.round(between(r, lo, hi));

export const addH = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600_000).toISOString();
export const addD = (day: string, d: number) => new Date(Date.parse(day + 'T00:00:00Z') + d * 86400_000).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 86400_000);
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '—');
export const istHM = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
export const inrShort = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(0)} K` : `₹${Math.round(n)}`);

const short = (n: string) => n.replace(/^paper boat\s+/i, '');
export const productLabel = (s: Pick<Snapshot, 'name' | 'pack_size'>) => `${short(s.name)} · ${s.pack_size}`;

/** A real shelf listing a sample record can hang on. */
export interface Anchor {
  platform: string;
  city: string;
  product_id: string;
  label: string;
  line: string;
  category: string;
  price: number;
  mrp: number;
  availability: Snapshot['availability'];
  stock: number;
}
export function anchorsOf(latest: Snapshot[]): Anchor[] {
  return latest
    .filter((s) => s.availability !== 'not_listed' && s.selling_price)
    .map((s) => ({
      platform: s.platform, city: s.city, product_id: s.product_id, label: productLabel(s), line: s.line, category: s.category,
      price: s.selling_price as number, mrp: (s.mrp ?? s.selling_price) as number, availability: s.availability, stock: s.stock,
    }))
    .sort((a, b) => (a.platform + a.city + a.product_id < b.platform + b.city + b.product_id ? -1 : 1));
}

export const RIVALS = ['Real', 'B Natural', 'Raw Pressery', 'Storia', 'Tropicana', 'Maaza', 'Frooti', 'Dabur'];
export const KEYWORDS = ['fruit juice', 'mango drink', 'coconut water', 'aam panna', 'sparkling water', 'ready to drink'];
