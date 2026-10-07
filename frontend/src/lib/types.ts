export type Availability = 'available' | 'out_of_stock' | 'not_listed';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface PlatformInfo {
  id: string; // 'blinkit'
  label: string; // 'Blinkit'
  connected: boolean; // false = shown in filters as "soon", no data yet
  color: string;
}
export interface CityInfo {
  id: string; // 'Delhi'
  label: string;
  connected: boolean;
  stores: number; // dark stores on the network (dummy for not-yet-observed)
}

/** One row of the backend `listing_snapshots` table: product x store x capture. */
export interface Snapshot {
  platform: string; // platform id
  city: string;
  pincode: string;
  store_id: string | null;
  product_id: string;
  name: string;
  brand: string;
  pack_size: string;
  category: string;
  line: string; // derived product line (Swing, Zero, Nata De Coco …)
  mrp: number | null;
  selling_price: number | null;
  availability: Availability;
  stock: number;
  shelf_life: string;
  shelf_life_days: number | null;
  marketer: string;
  store_name: string | null;
  store_address: string | null;
  url: string;
  scraped_at: string; // ISO UTC — drives every "sold" calculation
  capture_id: string; // '2026-09-29-S2' (date + slot, 3 slots a day)
}

/** What changed for one listing between two consecutive captures. */
export interface SelloutInterval {
  key: string; // platform|city|store|product
  platform: string;
  city: string;
  product_id: string;
  name: string;
  pack_size: string;
  line: string;
  category: string;
  from: string; // previous scraped_at
  to: string; // this scraped_at
  capture_id: string; // capture the interval ends at
  day: string; // IST date of `to`
  stock_from: number;
  stock_to: number;
  units: number; // ESTIMATED units sold = max(0, stock_from - stock_to)
  restocked: number; // stock increase (restock) — never counted as sales
  price: number; // selling price at `to`
  revenue: number; // units * price (ESTIMATE)
  hours: number; // gap between the two captures
  oos: boolean; // out of stock at both ends: demand unobservable
}

export interface Signal {
  id: string;
  severity: Severity;
  type: string;
  title: string;
  detail: string;
  platform: string;
  city: string;
  product?: string;
  metric: string;
  delta: string;
  confidence: number;
  detected_at: string;
  rule: string;
}

export interface Meta {
  captured_at: string;
  captures_per_day: number;
  capture_count: number;
  first_capture_at: string;
  listings: number;
  products: number;
}
