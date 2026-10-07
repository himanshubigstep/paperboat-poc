# Decision Log

Append new entries at the bottom. Status: Accepted | Proposed | Superseded.

## D-001 — Platform and cities
**Accepted.** Blinkit only; cities Delhi (New Delhi) and Mumbai. Other platforms in the reference site are ignored.

## D-002 — Backend stack
**Accepted** (from sheet *Tech Stack*). Python 3.13 async, Playwright headless Chromium (one adapter for Blinkit), PostgreSQL + TimescaleDB single node, raw snapshot table in JSONB, FastAPI with generated OpenAPI, scheduled jobs on the capture server (Airflow only in Part B).

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
