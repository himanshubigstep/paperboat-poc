# Decision Log

Append new entries at the bottom. Status: Accepted | Proposed | Superseded.

## D-001 — Platform and cities
**Accepted.** Blinkit only; cities Delhi (New Delhi) and Mumbai. Other platforms in the reference site are ignored.

## D-002 — Backend stack
**Accepted** (from sheet *Tech Stack*). Python 3.13 async, Playwright headless Chromium (one adapter for Blinkit), PostgreSQL + TimescaleDB single node, raw snapshot table in JSONB, FastAPI with generated OpenAPI, scheduled jobs on the capture server (Airflow only in Part B). **Hosting and scheduler superseded for the POC by D-024** (Supabase-hosted Postgres, no TimescaleDB extension; GitHub Actions instead of a capture server). The language/framework/Playwright/JSONB choices in this decision still stand.

## D-003 — Frontend stack
**Accepted** (revised). Next.js (App Router) + TypeScript + **Ant Design 5**; charts `@ant-design/charts`; TanStack Query; typed client from backend OpenAPI. Supersedes the earlier ECharts/plain-CSS idea.

## D-004 — Keep raw responses
**Accepted.** Every capture stores the raw response so a parsing fix never needs re-capture.

## D-005 — No data files in the repo
**Accepted.** The `data/` folder was removed. Frontend and AI layer get all data from the backend API. In week 1 Jeetpal publishes the OpenAPI spec and a stub/mock server so Himanshu and Gajendra can build before real captures exist.

## D-006 — Estimates are labelled
**Accepted** (sheet). Sell-out is an estimate from stock deltas; the UI must label it "estimate" everywhere it appears.

## D-007 — Reduced navigation
**Accepted.** 8 of the reference's 13 sidebar items; see `plan.md`.

## D-008 — Test-scrape observations
**Info.** First Blinkit test scrape (2026-09-29): 91 rows, 51 unique product_ids, one pincode per city (110005 Delhi, store 36383; 400050 Mumbai, store 34679). 5 rows are `not_listed` with blank store/brand/category/price — "not listed", not errors. No search rank/sponsored fields yet (P1.4). Availability values: `available`, `out_of_stock`, `not_listed`.

## D-009 — Visual direction: modern Gen Z, not a clone
**Accepted.** Reproduce the reference site's structure and screens, but with a new modern Gen Z look (dark-first, bento grid, violet/lime/coral palette, rounded cards, motion). Details in `rules/frontend.md`.

## D-010 — AI layer ownership and approach
**Accepted.** Gajendra Sharma owns `ai-layer/`. Assistant uses function calling over read-only tools (no vector DB); recommendations are rule-based, the LLM only phrases explanations. Hosting (separate service vs router in backend) — **open**, decide with Jeetpal in W1.

## D-011 — Full reference-site coverage, multi-platform/multi-city by design
**Accepted.** The frontend covers every page of the reference product (Home, Dashboards with 11 tabs, Signals, Assistant, Inbox, Workflow Monitoring, Data & Datasets, Reports, Content & Listing Health, Ratings & Reviews, Alerts, Catalogue Matching, Value & Outcomes) plus Products, Stock & Sell-out, Recommendations. Same sections as the reference, our own design. Platform and city are global filters (`?platform=blinkit&city=Delhi,Mumbai`); only Blinkit/Delhi/Mumbai are connected, others show as "soon". No screen hard-codes a platform or city.

## D-012 — Discount and units sold are always calculated
**Accepted.** Discount % = (MRP − selling price) ÷ MRP, never read from the feed. Units sold = stock drop between two consecutive captures of the same listing ordered by `scraped_at`; a stock rise is a restock and is excluded. Result is a lower-bound estimate, always labelled "Estimate". Code: `frontend/src/lib/metrics.ts`. The backend must therefore return every capture (3/day) per listing, not only the latest.

## D-013 — Real vs sample data on screens
**Accepted.** Capture-derived numbers (availability, price, discount, stock, sell-out, signals) are real. Everything the capture cannot prove (search rank, competitors, ratings, media, forecast, workflows, feeds…) is sample data, marked with a "Sample data" chip, shaped like the reference product's data, and anchored to real SKUs/stores where possible.

## D-014 — Dummy history for the sell-out demo
**Accepted (temporary).** The 91-row Blinkit test scrape (2026-09-29) is the latest capture of each listing; 40 earlier captures per listing are synthesised (seeded) in `frontend/src/mock/snapshots.ts` so the sell-out maths can be shown. Removed when `GET /snapshots` is live.

## D-015 — Capture unit is the dark store
**Proposed** (backend plan `docs/plans/2026-10-08-backend-poc-plan.md`). Price and stock are per `store_id`, and several pincodes share one store. Each run visits each primary store once via a representative pincode; `pincode_stores` maps pincodes to stores.

## D-016 — Location discovery seeds
**Proposed.** Seed from the India Post pincode directory (Delhi: all districts; Mumbai: Mumbai City + Mumbai Suburban), plus an optional lat/lng grid pass if stores are missed. Count reported against the planning assumption.

## D-017 — Listing from search, detail from product page
**Proposed.** Listing fields (price, MRP, stock) come from Paper Boat search results per store. The product page is loaded once per product × store per day for shelf life / marketer / seller address, and to confirm a priority SKU missing from search (`not_listed` vs `out_of_stock`).

## D-018 — Paper Boat master catalogue
**Proposed.** All Paper Boat products on Blinkit in both cities (brand starts "paper boat" or marketer "Hector"), with `is_drink` flag and `category_l1 > category_l2 (subcategory) > category_l3` from breadcrumbs. The 10–15 priority SKUs are picked from it in `backend/config/priority_products.yaml`.

## D-019 — Capture slots and capture_id
**Proposed.** 06:00 / 12:00 / 20:00 IST (matches `frontend/src/lib/config.ts`); `capture_id = <IST date>-S<1..3>`. Search rank once a day (S2) unless timing shows 3×/day fits.

## D-020 — Scheduler
**Superseded by D-024** for the POC. Was: cron / systemd timer calling the backend CLI; Postgres advisory lock prevents overlapping runs. No in-process scheduler. The advisory-lock mechanism carries over unchanged under D-024.

## D-021 — Week-1 API stub from the real schemas
**Proposed** (backend plan rev 2, T0.5). The stub is the real FastAPI app with Pydantic response models and examples; `backend/openapi.json` is exported from it and served by a Prism mock. No data files (D-005); stub and real API share one schema.

## D-022 — AI layer hosting and data access
**Proposed** (closes D-010 once agreed with Gajendra). `ai-layer/` runs as its own service. The backend reverse-proxies `/assistant/*` and `/recommendations*` so the frontend has one base URL. Assistant tools call the backend HTTP API for any figure the dashboard also shows; `pb_readonly` is for ad-hoc SELECTs only. Recommendations, explanations and chat sessions live in DB schema `ai`, written by role `pb_ai`.

## D-023 — Success measures are queryable
**Proposed** (P0.1, plan T0.0). Each pilot success measure in `docs/pilot/success-measures.md` is computed by `pb report success-measures` from the DB, so the demo is judged on numbers anyone can rerun.

## D-024 — POC infra: GitHub Actions scheduler + Supabase database
**Proposed** (2026-10-08, typed request: "run this job three times a day through GitHub Actions and get data stored in a Supabase database"). Supersedes the hosting half of D-002 and all of D-020 for the duration of the POC.

- **Scheduler:** a GitHub Actions workflow (`.github/workflows/capture.yml`) with `schedule: cron '30 0,6,14 * * *'` (UTC = 06:00/12:00/20:00 IST, D-019) plus `workflow_dispatch` for manual reruns. No dedicated capture server. Postgres advisory lock (D-020's mechanism) still prevents overlapping runs since the lock lives in the database, not on a runner.
- **Database:** a Supabase-hosted Postgres project instead of self-hosted PostgreSQL + TimescaleDB. Supabase's hosted offering does not support the `timescaledb` extension, so `listing_snapshots` / `search_rank_snapshots` are **plain tables** indexed on `scraped_at`, and dashboard rollups are a materialized view refreshed after each run instead of a Timescale continuous aggregate. POC volume (~250k listing rows + ~1.7M rank rows over 4 weeks) does not need hypertables or compression.
- **Raw responses:** JSONB in Supabase only, no local gzip backup — a GitHub Actions runner is destroyed at the end of each job.
- **Known trade-offs, accepted for the POC:** GitHub's `schedule:` trigger is best-effort (can run late) and is disabled after 60 days with no commits to the repo; runs execute from GitHub's shared IP ranges (slightly higher block risk than a dedicated host); private-repo scheduled runs draw down the account's Actions-minutes quota. Mitigations: `/freshness` + stale-run quality check catch a missed slot same-day; `workflow_dispatch` for manual catch-up; weekly report commit keeps the schedule from expiring; minutes usage checked in week 1.
- **Revisit:** if block rate, data volume, or history length outgrows what plain Postgres + a materialized view can handle, move to the original D-002 self-hosted Postgres + TimescaleDB setup. Documented in `docs/pilot/scaling-notes.md` (T5.4).
- Full detail: `docs/plans/2026-10-08-backend-poc-plan.md` revision 3 (T0.1, T0.3, T0.6, T1.9, T1.14, T2.1, Risk 4).
