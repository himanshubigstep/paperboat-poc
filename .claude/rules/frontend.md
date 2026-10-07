# Frontend rules — Himanshu Singh

Stack: **Next.js (App Router) + TypeScript (strict) + Ant Design 5**. Charts: `@ant-design/charts`. Dir: `frontend/`.
Reference: https://paperboat.assistents.ai/ — **copy its information architecture and screens, NOT its look.** The visual language is a modern Gen Z redesign (below). Data: **Blinkit, Delhi & Mumbai only**, all of it from the backend API (no local data files).

## Information architecture (same as reference, trimmed to POC)
Shell = left sidebar + top header + main + footer.
- **Sidebar:** Overview · Dashboards · Products · Signals & Insights · Recommendations · Ask the Assistant · Data & Datasets · Reports Center · Settings · Help. Collapsible to icon rail; becomes a drawer on mobile.
- **Header:** command-style search/"Ask anything" (⌘K), city switch (Delhi · Mumbai · Both), date range, data-freshness pill (last capture per city), theme toggle, signals badge.
- **Footer:** slim — "Blinkit · last capture <time IST>", version, help link.
- **Main:** page title + subtitle + action buttons → KPI row → **bento grid** of cards.
- Global filters (city, date, location, product, keyword) live in URL query params and survive refresh on every screen.

## Screens (Part A items 9–15)
1. **Overview** — KPI tiles, buyable-availability chart, Delhi vs Mumbai mini cards, top signals, "needs a decision" list.
2. **Products** — Ant `Table`: sort, filter, column toggle, CSV export, row drawer with price/stock history.
3. **Availability & est. sell-out** — heatmap (product × location), stock-out list, trend lines. Sell-out labelled **Estimate**.
4. **Search, price & discount** — keyword rank table with Paid/Organic tag, price & discount trend.
5. **City comparison** — Delhi vs Mumbai side by side, same measures.
6. **Recommendations** — ranked cards, Free/Paid tag, evidence, "Why?" opens explanation drawer.
7. **Ask the Assistant** — chat page + collapsible right dock; every figure links to its query (`/query/{id}`).
8. **Data quality banner** — shows when `/quality/issues` returns items.

## Design direction — "modern Gen Z"
Feel: bold, playful, fast, uncluttered. Dark-first with a polished light mode. Think Linear/Arc/Spotify-Wrapped energy, still data-dense enough for analysts.
- **Layout:** bento grid (mixed card sizes, 16–24px gap), generous whitespace, big numbers.
- **Shape:** radius 16px cards, 12px controls, pill badges/tags; soft layered shadows; subtle 1px translucent borders; glass blur only on header and overlays.
- **Colour (tokens, light/dark):**
  - Primary electric violet `#7C5CFF` (dark `#9B85FF`)
  - Accent lime `#C8F560` (CTA highlights, positive deltas on dark)
  - Coral `#FF6B6B` (danger/OOS), Mint `#2DE1C2` (success/in stock), Sunset `#FF9F43` (warning; nod to Paper Boat orange), Sky `#4CC9F0` (info)
  - Dark bg `#0E0E13`, surface `#16161D`, raised `#1E1E28`, border `rgba(255,255,255,.08)`; Light bg `#F7F6FB`, surface `#FFFFFF`, border `rgba(20,20,40,.08)`
  - Hero/KPI gradient: violet → coral at low opacity; max one gradient per screen region.
- **Type:** headings *Space Grotesk* (600), body *Plus Jakarta Sans* via `next/font`; tabular numbers for data; KPI numbers 32–40px.
- **Motion:** 150–250ms ease-out hover lifts, number count-up on KPI load, skeleton shimmer, smooth chart entrance; respect `prefers-reduced-motion`.
- **Icons:** `@ant-design/icons` (outlined/two-tone), consistent 18–20px.
- **Voice:** short, friendly microcopy ("All good in Mumbai ✨" style is OK sparingly; never in error messages that block work).
- Charts use a fixed series palette: violet, lime, coral, sky, sunset, mint, pink `#F15BB5`, slate.

## Ant Design theming (single source)
- One file `src/theme/antdTheme.ts` exporting light + dark `ThemeConfig` (`token`: colorPrimary, borderRadius, fontFamily; `components`: Table, Card, Menu, Layout, Tag…) used by `<ConfigProvider>`; switch with `theme.darkAlgorithm` / `defaultAlgorithm`.
- Extra tokens (gradients, bento gaps, heat colours) in `src/theme/tokens.css` as CSS variables; read Ant tokens via `theme.useToken()`.
- **No hard-coded colours/sizes in components.** Use Ant components first; custom CSS only through CSS Modules.
- Next.js: wrap with `@ant-design/nextjs-registry` (AntdRegistry) to avoid style flash.

## Code structure
```
frontend/src/
  app/(shell)/{overview,dashboards,products,signals,assistant,data,reports}/page.tsx
  components/{layout,cards,charts,tables,feedback}/
  lib/api/        # typed client generated from backend OpenAPI
  hooks/          # useFilters (URL-synced), useCity, useCapture
  theme/
```
- Server Components for data fetch where possible; client components for charts/filters.
- Data layer: typed client from OpenAPI (`openapi-typescript`), TanStack Query for caching. Until the backend is live, develop against the stub/mocked OpenAPI server Jeetpal provides in week 1 (or MSW generated from the same spec). No data files committed.

## Data display rules
- Every screen: loading skeleton, empty state, error state with retry, and visible capture timestamp.
- `not_listed` → "Not listed" (neutral tag), `out_of_stock` → coral tag, `available` → mint tag. They are different states.
- Sell-out always carries an **Estimate** tag. ₹ with `en-IN` formatting. Discount % = (mrp − selling_price) / mrp. Time shown in IST.

## Quality
Accessible (keyboard, visible focus, WCAG AA contrast in both themes, aria labels on charts), responsive mobile → desktop, dark and light verified for every screen. ESLint + Prettier + `tsc --noEmit` clean before PR. Vitest/RTL for table + filters; one Playwright smoke test per screen.
