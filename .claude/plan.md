# POC Plan — 4 weeks

Effort model from the sheet: 1 day = 8h, 5 days = 1 week. Phases: P0 Discovery → P1 Capture → P2 Data/API/QA-style checks → P3 Dashboard → later phases (assistant, recommendations, outcome report). Task refs below (P1.1, P3.1 …) match the sheet's *Dev Plan – POC* tab.

## Week-by-week

| Week | Backend (Jeetpal) | Frontend (Himanshu) | AI (Gajendra Sharma) |
|---|---|---|---|
| 1 | P0 freeze data contract; **P1.1** discover every Blinkit store/pincode in Delhi & Mumbai; project + DB schema | P0.3 agree contract; scaffold Next.js+TS+Ant Design, theme file; **P3.1** shell (sidebar, header, footer, theme, global filters) on mock data | Read tool list + prompts; recommendation rules agreed with team; assistant skeleton calling stub API; `query_id` logging |
| 2 | **P1.2/P1.3** listing + detail capture (price, MRP, stock, shelf life, marketer, store address); raw JSONB snapshot; scheduler 3×/day | **P3.2** Overview + Products table (sort/filter/export) | Assistant tools live on real API (SSE streaming); SQL guard; recommendation engine v1 |
| 3 | **P1.4** search rank + sponsored flag; data quality checks; FastAPI endpoints + OpenAPI; sell-out estimate | **P3.3** Availability & est. sell-out; **P3.4** Search/Price/Discount | Rules complete + priority score; explanations (nightly batch + cache); golden-set eval |
| 4 | Harden, stale-run / blocked-request detection; capture-volume numbers for outcome report | **P3.5** City comparison; **P3.6** Recommendations + Assistant screens; **P3.7** live data, loading/empty/error states, capture timestamp | Tuning, cost/latency checks, outcome-report narrative inputs |

## Jeetpal — Backend
1. Discover all Blinkit delivery locations (store_id / pincode / address) in **Delhi** and **Mumbai**; store list refreshable; report count vs planning assumption.
2. Capture all priority Paper Boat listings per location, 3×/day: fields in `rules/data-contract.md`.
3. Detail-page fields: shelf_life, shelf_life_days, marketer, store_name, store_address.
4. Search ranking + sponsored/organic flag for agreed keywords.
5. Postgres + TimescaleDB; raw snapshots in JSONB; parsing re-runnable from raw.
6. FastAPI + OpenAPI serving every captured field, filterable by city, location, product, keyword, date range.
7. Data-quality checks: missing fields, unusual prices, stale runs, blocked requests.
8. Estimated sell-out (stock delta between captures, excluding restocks) — always labelled "estimate".

Definition of done: listing records for both cities with every agreed field populated; a stated reason wherever a field is genuinely absent (e.g. `not_listed` rows).

## Himanshu — Frontend
Replicate the reference site's look/structure, restricted to POC scope.
1. **Shell (P3.1):** Next.js + TS + Ant Design; Gen Z theme (`rules/frontend.md`); left sidebar nav, top header (⌘K search/ask, data freshness, theme toggle, city/date filters), footer, responsive collapse. Filters persist across screens and page refresh (URL query params).
2. **Home / Overview (P3.2):** KPI grid, buyable availability chart, scoreboard-style summary for Blinkit, city board (Delhi, Mumbai), provenance chip "Shelf capture · <date>".
3. **Products (P3.2):** full product table — sorting, filtering, CSV export.
4. **Availability & sell-out (P3.3).**
5. **Search, price & discount (P3.4):** keyword rank with paid/organic marker, price/discount trend.
6. **City comparison (P3.5):** Delhi vs Mumbai side by side.
7. **Recommendations + Assistant (P3.6).**
8. **Live data + states (P3.7):** loading/empty/error, visible capture timestamp.

Sidebar items for the POC (reference has 13; we keep 8): Overview, Dashboards, Products, Signals & Insights, Ask the Assistant, Data & Datasets, Reports, Settings/Help (stub). Dropped: Content & Listing Health, Ratings & Reviews, Catalogue Matching, Value & Outcomes, Alerts & Subscriptions, Inbox, Workflow Monitoring (out of POC scope; may return in Part B).

Definition of done: all screens live on captured data; a known stock-out in the data shows correctly; ranking/price figures reconcile with underlying records.

## Gajendra Sharma — AI layer (sheet items 13–16)
1. **Assistant (13):** chat that answers in plain language by calling read-only tools over the backend API/DB; every figure carries a `query_id`; streaming responses; session memory.
2. **Recommendation engine (14):** rule-based (`recommendations.yaml`) per product × location × city; each marked free/paid, ranked by priority, evidence attached.
3. **Explanations (15):** plain-language "why" per recommendation + follow-up Q&A; nightly batch with caching.
4. **Outcome report inputs (16):** narrative of pilot findings, real capture volumes vs assumptions, scaling notes.
5. **Quality:** golden-set evaluation, SQL guard, no-invented-numbers check, latency/cost tracking.
Dependencies: contract frozen W1 (Jeetpal); `/assistant/chat`, `/recommendations`, `/query/{id}` shapes agreed with Himanshu in W1 so screens can build on stubs.
Definition of done: assistant answers a sample question set correctly with traceable queries; recommendations visible in the UI with explanations.

## Milestones
- End W1: contract frozen, shell running on stub API (OpenAPI mocks), store list produced.
- End W2: first real capture in DB; Overview + Products live; assistant answering on real API.
- End W3: API complete; availability/search/price screens live.
- End W4: city comparison, recommendations, assistant, polish; outcome report.

## Open questions (resolve in P0)
- Recommendation rules: confirm thresholds (N captures, price jump %) with the business owner.
- Priority product list (10–15) — pick from the ~51 SKUs seen in the first test scrape.
- Search keywords to track.
- Test scrape had one pincode per city (110005, 400050); backend to enumerate all locations.
