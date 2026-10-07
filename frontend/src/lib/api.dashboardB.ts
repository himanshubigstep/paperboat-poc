/** Fetchers for the sample feeds behind the executive-dashboard tabs (search, delivery, media, voice, forecast). */
import { get } from '@/lib/api';
import { adSpend, beyondCities, forecast, searchShelf, slaCells, voice } from '@/mock/dashboard-b';

export const dashB = {
  search: (platforms: string[], cities: string[]) => get('/dashboard/search-shelf', () => searchShelf(platforms, cities)),
  sla: (platforms: string[], cities: string[]) => get('/dashboard/delivery-sla', () => slaCells(platforms, cities)),
  ads: (platforms: string[]) => get('/dashboard/media', () => adSpend(platforms)),
  voice: (platforms: string[], lines: { line: string; listings: number }[]) => get('/dashboard/voice', () => voice(platforms, lines)),
  forecast: (platforms: string[], cities: string[], lines: string[], day: string) => get('/dashboard/forecast', () => forecast(platforms, cities, lines, day)),
  beyond: () => get('/dashboard/network-beyond', () => beyondCities()),
};
