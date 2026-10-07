/** SAMPLE report catalogue, recipients, templates and delivery history (shape follows the reference reports page). */
export type ReportKind = 'Scheduled' | 'Real-time' | 'AI generated';
export interface ReportDef {
  id: string;
  name: string;
  sub: string;
  kind: ReportKind;
  cadence: string;
  last: string;
  format: 'PDF' | 'CSV' | 'XLSX';
  status: 'Ready' | 'Draft' | 'Paused';
  owner: string;
  audience: string[];
  channels: string[];
  /** true = every figure in the preview is computed from the capture */
  real: boolean;
}

export const REPORTS: ReportDef[] = [
  { id: 'brief', name: 'CMO Monday brief', sub: 'Quick-commerce · weekly executive brief', kind: 'Scheduled', cadence: 'Weekly · Monday 07:30', last: '28 Sep 07:30', format: 'PDF', status: 'Ready', owner: 'Marketing admin', audience: ['CMO', 'Head of sales', 'QC account managers'], channels: ['Email', 'Slack #leadership'], real: true },
  { id: 'availx', name: 'Availability exceptions', sub: 'Every listing that is not buyable', kind: 'Real-time', cadence: 'After every capture', last: '29 Sep 12:07', format: 'CSV', status: 'Ready', owner: 'Supply planning', audience: ['Supply planning', 'Category team'], channels: ['Email', 'Inbox'], real: true },
  { id: 'price', name: 'Price & promo tracker', sub: 'Every tracked listing, price and calculated discount', kind: 'Scheduled', cadence: 'Daily · 08:00', last: '29 Sep 08:00', format: 'XLSX', status: 'Ready', owner: 'Pricing', audience: ['Pricing', 'Sales ops'], channels: ['Email'], real: true },
  { id: 'sellout', name: 'Estimated sell-out readout', sub: 'Units from stock change between captures', kind: 'Scheduled', cadence: 'Daily · 09:00', last: '29 Sep 09:00', format: 'PDF', status: 'Ready', owner: 'Insights', audience: ['Sales ops', 'Finance'], channels: ['Email', 'Slack #sales'], real: true },
  { id: 'deadstock', name: 'Dead-stock & expiry watchlist', sub: 'Short shelf life against units on the shelf', kind: 'Scheduled', cadence: 'Weekly · Friday 10:00', last: '26 Sep 10:00', format: 'PDF', status: 'Paused', owner: 'Supply chain', audience: ['Supply chain'], channels: ['Email'], real: true },
  { id: 'content', name: 'Content & listing health audit', sub: 'Paper Boat shelf listings', kind: 'AI generated', cadence: 'On demand', last: '27 Sep 16:20', format: 'PDF', status: 'Ready', owner: 'Catalogue team', audience: ['Catalogue team'], channels: ['Email'], real: true },
  { id: 'catalogue', name: 'Catalogue matching review', sub: 'Catalogue matches and linking method', kind: 'AI generated', cadence: 'On demand', last: '27 Sep 16:40', format: 'PDF', status: 'Draft', owner: 'Catalogue team', audience: ['Catalogue team'], channels: ['Email'], real: true },
  { id: 'dq', name: 'Data quality & freshness', sub: 'Every source, every capture', kind: 'Real-time', cadence: 'After every capture', last: '29 Sep 12:07', format: 'CSV', status: 'Ready', owner: 'Data platform', audience: ['Data platform'], channels: ['Slack #data'], real: true },
  { id: 'compet', name: 'Competitive response brief', sub: 'Price, promotion and shelf position against tracked brands', kind: 'AI generated', cadence: 'On demand', last: '24 Sep 11:00', format: 'PDF', status: 'Ready', owner: 'Insights', audience: ['CMO'], channels: ['Email'], real: false },
  { id: 'search', name: 'Search visibility review', sub: 'Share of search by keyword', kind: 'Scheduled', cadence: 'Weekly · Wednesday 11:00', last: '24 Sep 11:00', format: 'PDF', status: 'Ready', owner: 'Growth', audience: ['Growth', 'Brand'], channels: ['Email'], real: false },
  { id: 'media', name: 'Media efficiency readout', sub: 'Sponsored spend against shelf availability', kind: 'Scheduled', cadence: 'Weekly · Tuesday 10:00', last: '23 Sep 10:00', format: 'PDF', status: 'Ready', owner: 'Performance marketing', audience: ['Performance marketing'], channels: ['Email'], real: false },
  { id: 'facc', name: 'Forecast accuracy', sub: 'Weekly · demand model against baseline', kind: 'Scheduled', cadence: 'Weekly · Monday 09:00', last: '28 Sep 09:00', format: 'PDF', status: 'Ready', owner: 'Demand planning', audience: ['Demand planning'], channels: ['Email'], real: false },
];

export const TEMPLATES = [
  { id: 't-avail', name: 'Availability by city', base: 'availx', kind: 'Scheduled' as ReportKind },
  { id: 't-price', name: 'Price & discount review', base: 'price', kind: 'Scheduled' as ReportKind },
  { id: 't-sell', name: 'Sell-out estimate (weekly)', base: 'sellout', kind: 'Scheduled' as ReportKind },
  { id: 't-content', name: 'Listing health audit', base: 'content', kind: 'AI generated' as ReportKind },
  { id: 't-account', name: 'Platform account review', base: 'brief', kind: 'AI generated' as ReportKind },
];

export const RECIPIENT_POOL = ['CMO', 'Head of sales', 'Category team', 'Supply planning', 'Pricing', 'Finance', 'Brand team', 'Customer success'];

export const HISTORY: { when: string; what: string; who: string }[] = [
  { when: '29 Sep 12:07', what: 'Generated after capture 2026-09-29-S2', who: 'System' },
  { when: '29 Sep 12:08', what: 'Delivered by email to recipients', who: 'System' },
  { when: '28 Sep 07:30', what: 'Scheduled run completed', who: 'System' },
  { when: '27 Sep 16:21', what: 'Opened and exported as PDF', who: 'Catalogue team' },
  { when: '26 Sep 10:00', what: 'Section list edited', who: 'Marketing admin' },
];
