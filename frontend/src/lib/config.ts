import type { CityInfo, PlatformInfo } from '@/lib/types';

/**
 * Platforms and cities the product knows about. Only `connected` ones have data today
 * (POC = Blinkit · Delhi · Mumbai). Add a row + flip `connected` when a new adapter goes live —
 * filters, tables and charts pick it up automatically.
 */
export const PLATFORMS: PlatformInfo[] = [
  { id: 'blinkit', label: 'Blinkit', connected: true, color: '#F8CB46' },
  { id: 'zepto', label: 'Zepto', connected: false, color: '#7C5CFF' },
  { id: 'swiggy', label: 'Swiggy Instamart', connected: false, color: '#FF9F43' },
  { id: 'bigbasket', label: 'BigBasket', connected: false, color: '#4CC9F0' },
  { id: 'minutes', label: 'Flipkart Minutes', connected: false, color: '#2DE1C2' },
  { id: 'now', label: 'Amazon Now', connected: false, color: '#F15BB5' },
  { id: 'jiomart', label: 'JioMart', connected: false, color: '#FF6B6B' },
  { id: 'dmart', label: 'DMart', connected: false, color: '#8B8FA3' },
  { id: 'firstclub', label: 'FirstClub', connected: false, color: '#C8F560' },
];

export const CITIES: CityInfo[] = [
  { id: 'Delhi', label: 'Delhi', connected: true, stores: 164 },
  { id: 'Mumbai', label: 'Mumbai', connected: true, stores: 186 },
  { id: 'Bengaluru', label: 'Bengaluru', connected: false, stores: 204 },
  { id: 'Hyderabad', label: 'Hyderabad', connected: false, stores: 141 },
  { id: 'Chennai', label: 'Chennai', connected: false, stores: 118 },
];

export const CONNECTED_PLATFORMS = PLATFORMS.filter((p) => p.connected);
export const CONNECTED_CITIES = CITIES.filter((c) => c.connected);
export const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;
export const platformColor = (id: string) => PLATFORMS.find((p) => p.id === id)?.color ?? '#8B8FA3';

/** 3 captures a day, UTC slot start (IST: 06:00, 12:00, 20:00) */
export const CAPTURE_SLOTS_UTC = ['00:30', '06:30', '14:30'] as const;
