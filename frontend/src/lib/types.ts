export type City = 'Delhi' | 'Mumbai';
export type CityFilter = City | 'Both';
export type Availability = 'available' | 'out_of_stock' | 'not_listed';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type KeywordType = 'brand_self' | 'category' | 'occasion' | 'competitor_brand';

export interface Meta {
  platform: 'Blinkit';
  captured_at: string; // ISO, UTC
  captures_per_day: number;
  cities: City[];
  products: number;
  keywords: number;
  stores: Record<City, number>;
  pincodes: Record<City, string>;
  runs_24h: { ok: number; failed: number; blocked: number };
}

export interface Product {
  product_id: string;
  name: string;
  line: string;
  pack_size: string;
  category: string;
  shelf_life_days: number;
  marketer: string;
}

/** One row per product x city (latest capture) */
export interface Listing {
  key: string;
  product_id: string;
  name: string;
  line: string;
  pack_size: string;
  category: string;
  city: City;
  store_id: string;
  mrp: number;
  selling_price: number;
  discount_pct: number;
  availability: Availability;
  stock: number;
  est_units_7d: number; // estimate
  best_rank: number | null;
  scraped_at: string;
  url: string;
}

export interface DayPoint {
  date: string;
  city: City;
  value: number;
}

export interface Signal {
  id: string;
  severity: Severity;
  type: 'availability' | 'price' | 'search' | 'sellout' | 'quality';
  title: string;
  detail: string;
  city: City | 'Both';
  product?: string;
  metric: string;
  delta: string;
  confidence: number; // 0-100
  detected_at: string;
  rule: string;
  free_or_paid: 'free' | 'paid';
}

export interface Recommendation {
  id: string;
  priority: number; // 0-100
  city: City | 'Both';
  product: string;
  action: string;
  why: string;
  type: 'free' | 'paid';
  evidence: { label: string; query_id: string }[];
  status: 'new' | 'reviewing' | 'done';
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  citations?: { label: string; query_id: string }[];
  estimate?: boolean;
}
