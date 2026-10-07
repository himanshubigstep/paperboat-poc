/**
 * Data access. Everything the UI shows goes through here so the swap from dummy data
 * to the backend (`NEXT_PUBLIC_API_BASE_URL`, see .claude/rules/data-contract.md) is one file.
 */
import * as m from '@/mock/data';
import type { CityFilter } from '@/lib/types';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

async function get<T>(path: string, mock: () => T): Promise<T> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 180)); // feel like a network call
    return mock();
  }
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  const body = await res.json();
  return body.data as T;
}

const inCity = <T extends { city: string }>(rows: T[], city: CityFilter) => (city === 'Both' ? rows : rows.filter((r) => r.city === city));

export const api = {
  meta: () => get('/summary', () => m.meta),
  listings: (city: CityFilter) => get(`/products?city=${city}`, () => inCity(m.listings, city)),
  availability: (city: CityFilter) =>
    get(`/availability?city=${city}`, () => ({
      states: m.availability_states,
      trend: inCity(m.availability_trend, city),
      matrix: m.availability_matrix,
      oos: inCity(m.oos_items, city),
    })),
  sellout: (city: CityFilter) => get(`/sellout?city=${city}`, () => ({ units: inCity(m.est_sellout, city), revenue: inCity(m.est_revenue, city) })),
  price: (city: CityFilter) => get(`/price-discount?city=${city}`, () => ({ trend: inCity(m.price_trend, city), bands: m.discount_bands, dispersion: m.price_dispersion })),
  search: (city: CityFilter) => get(`/search-rank?city=${city}`, () => ({ ranks: inCity(m.search_rank, city), sos: m.sos_by_keyword, trend: inCity(m.rank_trend, city) })),
  compare: () => get('/cities/compare', () => m.city_compare),
  signals: () => get('/signals', () => m.signals),
  recommendations: () => get('/recommendations', () => m.recommendations),
  alertRules: () => get('/alert-rules', () => m.alert_rules),
  reports: () => get('/reports', () => m.reports),
  runs: () => get('/runs', () => m.capture_runs),
  datasets: () => get('/datasets', () => m.datasets),
  quality: () => get('/quality/issues', () => m.quality_issues),
  chat: async (q: string) =>
    get('/assistant/chat', () => {
      const hit = m.assistant_answers.find((a) => a.match.test(q));
      return hit ?? { text: 'I can answer questions about Blinkit availability, price, search rank and estimated sell-out for Delhi and Mumbai. Try one of the suggestions.', citations: [] as { label: string; query_id: string }[], estimate: false };
    }),
};
