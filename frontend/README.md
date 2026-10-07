# Paper Boat · Quick-Commerce Intelligence — Frontend

Next.js 14 (App Router) · TypeScript · Ant Design 5 · @ant-design/charts · TanStack Query. Gen Z theme, dark-first.
Built for **many platforms and many cities**; connected today: Blinkit · Delhi · Mumbai (`src/lib/config.ts`).

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # tsc --noEmit
NEXT_DIST_DIR=.next-check npm run build   # build without touching a running `next dev`
```

## Pages (same sections as the reference product)
Monitor: Overview `/` · Dashboards `/dashboards` (11 tabs) · Products `/products` · Stock & Sell-out `/stock`
Insight: Signals `/signals` · Recommendations · Ask the Assistant `/assistant` · Inbox · Alerts
Quality: Content & Listing Health · Ratings & Reviews · Catalogue Matching
Operate: Workflow Monitoring · Data & Datasets · Reports Center · Value & Outcomes · Settings · Help

## Filters
Header: platform, city, range → URL (`?platform=blinkit&city=Delhi,Mumbai&range=7`). `useFilters()` reads them; `useDataset()` returns the data already filtered. Adding a platform/city = add it to `config.ts` and flip `connected`.

## Numbers
- **Discount** = (MRP − selling price) ÷ MRP — always calculated (`src/lib/metrics.ts`).
- **Units sold (estimate)** = stock drop between consecutive captures of a listing ordered by `scraped_at`; a rise is a restock (not sales). Always labelled *Estimate*.
- Capture-derived numbers are real; anything else is **sample data** and carries a "Sample data" chip.

## Data
Dummy by default (`NEXT_PUBLIC_USE_MOCK=true`): the 91-row Blinkit test scrape is the latest capture of each listing and 40 earlier captures are generated (`src/mock/snapshots.ts`). All access goes through `src/lib/api.ts` → set `NEXT_PUBLIC_USE_MOCK=false` + `NEXT_PUBLIC_API_BASE_URL` for the backend (`GET /snapshots`, see `../.claude/rules/data-contract.md`).
More detail for contributors: `docs/foundation.md`.
