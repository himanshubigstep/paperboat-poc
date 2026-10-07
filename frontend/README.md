# Paper Boat · Quick-Commerce Intelligence — Frontend

Next.js 14 (App Router) · TypeScript · Ant Design 5 · @ant-design/charts · TanStack Query.
Blinkit · Delhi + Mumbai only. Gen Z theme (dark-first), see `../.claude/rules/frontend.md`.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint     # tsc --noEmit
```

## Data
Runs on **dummy data** by default (`NEXT_PUBLIC_USE_MOCK=true`). All data goes through `src/lib/api.ts`;
set `NEXT_PUBLIC_USE_MOCK=false` and `NEXT_PUBLIC_API_BASE_URL` to use the backend. Mock shapes live in
`src/mock/data.ts` and follow `../.claude/rules/data-contract.md`.

## Structure
```
src/app/(shell)/   overview, dashboards (5 tabs), products, signals, recommendations, assistant, data, reports, settings, help
src/components/    AppShell (sidebar/header/footer), ui (cards, tags, KPI), charts (Ant Design Charts wrappers)
src/theme/         antdTheme.ts (light + dark tokens) · src/app/globals.css (CSS variables, bento grid)
src/hooks/         useFilters (city / range in the URL)
```
