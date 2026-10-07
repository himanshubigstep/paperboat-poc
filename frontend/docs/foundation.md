# Frontend foundation — read this before building a page

Project: Paper Boat Quick-Commerce Intelligence (frontend only, dummy data until the backend API exists).
Stack: Next.js 14 App Router · TypeScript strict · Ant Design 5 · `@ant-design/charts` · TanStack Query.
Today: **Blinkit** only, cities **Delhi + Mumbai** — but every screen must be built for **many platforms and many cities** (see "Multi-platform rule").

## Goal for every page
Reproduce the **structure of the reference page** (same page title, same sections/cards in the same order, same tabs, same table columns, same buttons/actions) with **our own Gen Z design** (dark-first, bento grid, violet/lime/coral, rounded cards). Do NOT copy the reference's look.
Reference pages are saved locally (read-only, static HTML whose inline JS builds the content; the data shapes are in `data.js`):

`/tmp/claude-1000/-home-himanshu-Downloads-paperboat-poc/68da78bd-eebd-4c62-8b1a-70c3f8e84d1c/scratchpad/site/`
`index.html  01_executive_dashboard.html  02_signals_insights.html  03_conversational_agent.html  05_inbox.html  06_workflow_monitoring.html  07_data_management.html  08_reports_center.html  09_content_health.html  10_ratings_reviews.html  11_alerts.html  12_catalogue_matching.html  13_value_outcomes.html  data.js  app.js  app.css`

Read your page's HTML (and the `data.js` keys it uses) to see exactly which cards/columns/buttons exist, then rebuild them. `grep -o '<h2>[^<]*</h2>'` and the inline `<script>` blocks are the fastest way to see the sections. Where the reference has a drawer/modal/inline action (Approve, Route, Snooze …) build a working UI for it (state in React, no backend call).

## Multi-platform / multi-city rule (important)
- Platforms and cities come from `src/lib/config.ts` (`PLATFORMS`, `CITIES`, `platformLabel`). Only `connected: true` ones have data (Blinkit; Delhi, Mumbai). Never hard-code "Blinkit", "Delhi" or "Mumbai" in logic or layout.
- Read the active filters with `useFilters()` → `platforms: string[]`, `cities: string[]`, `range: 7|14`, `query` (append to internal links to keep filters), `scopeLabel`. The header filter bar changes them; pages must react.
- Tables/charts that the reference splits "by platform" or "by city" must iterate the **active** platforms/cities and work for 1 or many. With one platform, a "by platform" table shows one row; a "platform × city" matrix is 1×2. Charts colour by series name (`color="city"` / `color="platform"` with labels from `platformLabel`) — colours are stable per name.
- If a screen would be empty for the filter scope, show `EmptyState`.

## Data you can rely on (REAL = derived from the Blinkit capture)
`const d = useDataset()` from `@/hooks/useDataset` — already filtered by platform/city/range:
- `d.isLoading`, `d.isError`, `d.refetch()`, `d.meta` (`captured_at`, `captures_per_day`, `capture_count`…)
- `d.snapshots`: `Snapshot[]` — every capture (3/day) per product × store: `platform, city, pincode, store_id, product_id, name, brand, pack_size, category, line, mrp, selling_price, availability ('available'|'out_of_stock'|'not_listed'), stock, shelf_life, shelf_life_days, marketer, store_name, store_address, url, scraped_at (ISO UTC), capture_id`
- `d.latest`: newest snapshot of each listing (what is on the shelf now). 91 listings today = 51 Paper Boat products over Delhi + Mumbai, incl. not-listed.
- `d.intervals`: `SelloutInterval[]` — ESTIMATED sell-out between consecutive captures (see below)
- `d.captures`: capture ids in scope, oldest → newest.
`useSignals()` from `@/hooks/useSignals` = `useDataset()` + `signals: Signal[]` derived from the data (stock-outs, discount shifts, restocks, city price gaps, sell-out swings, data quality). Reuse/extend; don't duplicate.

### Calculation rules — use the helpers in `@/lib/metrics`, never re-implement
- **Discount** is NEVER read from a feed; always `discountPct(mrp, selling_price)` and `discountAmount(mrp, selling_price)` (`hasDiscount(s)`). Not-listed rows have null price → 0.
- **Availability**: `availabilityStats(rows)` → `{available,out_of_stock,not_listed,listed,total,buyablePct}` (buyable % is of *listed*). Out of stock ≠ not listed — show them as different states (`AvailTag`).
- **Units sold (estimate)**: derived from stock change between consecutive captures of the same listing, ordered by `scraped_at`: stock down → units sold; stock up → restock (never counted as sales); 0→0 → unobservable. Revenue = units × selling price. It is a **lower-bound estimate** → ALWAYS label with `<EstimateTag />` (or the word "est."). Use `d.intervals`, `dailySellout(iv, seriesFn)`, `groupSum(...)`.
- Times: stored UTC, shown IST (`fmtIST`, `istDay`). Currency ₹ via `fmtINR`, numbers via `fmtNum` (en-IN).
- `productLine(name)`, `shortName(name)` for "by product line" cuts.

### Sample data (everything the capture can't prove)
Search rank, competitors/brand shelf, ratings & reviews, media spend, customer voice, forecast, CFA inventory, workflows, feeds, reports, alert rules, value cases, matching, etc. are **sample** data: build a deterministic (seeded RNG — see `src/mock/snapshots.ts` for the pattern; **no Math.random / Date.now in render**, SSR must match) generator in your own `src/mock/<page>.ts`, in the **same shape the reference uses** (`data.js`), restricted to the active platforms/cities. Wherever it appears show `<Prov kind="sample">Sample data</Prov>` in the card footer (or `<SampleNote />` when the whole screen is sample). Real-data cards use `<Prov>Shelf capture · …</Prov>`. Where a sample figure can be anchored to real data (e.g. SKUs, products, price, availability, pack sizes, categories, stores/addresses from the capture) do so.
Expose page-specific fetchers through your own file, e.g. `src/lib/api.<page>.ts` using `get()` from `@/lib/api`, and consume with `useQuery`.

## Shared building blocks (import, don't copy; **do not edit shared files**)
- `@/components/ui`: `PageHead`, `Section`, `Card({title,sub,actions,footer,hero,lift})`, `Kpi`, `Prov`, `SkeletonBlock`, `ErrorState`, `EmptyState`, `EstimateTag`, `AvailTag`, `SevTag`, `CityTag`, `PlatformTag`, `PaidTag`, `Heat`, `DataWarning`, `SampleNote`, `Delta`, `UrlTabs` (tabs synced to `?tab=`), `fmtINR`, `fmtNum`, `fmtIST`, `fmtDay`, `shortName`.
- `@/components/charts`: `LineChart`, `AreaChart`, `ColumnChart` (`stack`), `BarChart`, `DonutChart` (props `data,x,y,color,height,yMin,yMax,formatter`) and `ChartKit` + `useChartBase(height)` for anything else (Heatmap, DualAxes, Scatter, Radar, Funnel, Gauge, Treemap, Waterfall, Histogram, Sankey, Liquid, Bullet). Chart colours are stable per series name through `colorScale`.
- Layout classes (`src/app/globals.css`): `.bento` (12-col grid) with `.span-3/4/5/6/7/8/12`, `.sec-head`, `.card`, `.feed-item`, `.heat`, `.prov`, `.kpi`, `.chat-bubble`, `.skel`, `.muted`, `.sec`, `.tnum`. Cards: `<Card className="span-6" …>`.
- Ant Design components for tables, tabs, drawers, modals, forms, steps, timeline, progress, switches, tags etc. Tokens/colours: `@/theme/antdTheme` (`palette`, `series`, `colorFor`); CSS variables `--pb-violet/lime/coral/mint/sunset/sky/pink`, `--surface/--raised/--border/--ink/--ink-2/--ink-3`. Never hard-code colours that must differ in dark/light — use the CSS variables or antd tokens.
- Config: `@/lib/config` (`PLATFORMS`, `CITIES`, `CONNECTED_*`, `platformLabel`, `platformColor`). Filters: `@/hooks/useFilters`. Types: `@/lib/types`.

## Rules
1. Each page is a client component under `src/app/(shell)/<route>/page.tsx` (`'use client'`). Large pages → split sections into files in a `components`-style sibling folder you own (e.g. `src/app/(shell)/inbox/parts/…` or `src/components/<page>/…`).
2. Every screen: loading skeleton (`SkeletonBlock`), empty state, error state with retry, `Prov` chips, EstimateTag on sell-out numbers. Responsive down to phone width (use `.bento` spans), dark + light, keyboard accessible, `aria-label` on icon buttons.
3. Real interactions: filters, sorting, tabs, drawers, modals, "Approve/Route/Snooze/…" buttons update local state and show a `message.success(...)` (from antd) — no network.
4. No new dependencies. No `any` unless unavoidable. No `Math.random`, `Date.now()` or `new Date()` without args during render. Keep files focused; match the code style of `src/lib/metrics.ts` / existing pages.
5. Only touch the files assigned to you. The shared files (`components/*`, `lib/*`, `hooks/*`, `theme/*`, `app/globals.css`, `mock/snapshots.ts`) belong to the foundation: if something is missing, build a local helper in your own folder.
6. Verify with `cd /home/himanshu/Downloads/paperboat-poc/frontend && npx tsc --noEmit` and fix errors **in your own files only** (other agents are writing other pages at the same time, so errors elsewhere are not yours). **Do NOT run `next build` or `next dev`** (they share `.next` and would break each other) — the integrator builds and visually checks everything afterwards.
7. When done, reply with: files created, what each page contains (sections/tabs), which numbers are real vs sample, and anything you could not do.
