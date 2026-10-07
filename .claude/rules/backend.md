# Backend rules — Jeetpal

Stack: Python 3.13 (async), Playwright + headless Chromium, PostgreSQL + TimescaleDB, FastAPI. Dir: `backend/`.

## Capture job
- Target: **Blinkit**, **every delivery location (store/pincode) in Delhi and Mumbai**, not only 110005 / 400050 (they were the only ones in the first test scrape). First task: enumerate and persist the location list (`locations` table: pincode, city, store_id, store_name, store_address, lat/lng if available); report the count.
- One adapter module `adapters/blinkit.py`; platform-specific logic never leaks outside it.
- Schedule 3×/day (e.g. 06:00, 14:00, 20:00 IST — confirm in P0). Each run gets a `run_id`; log started/finished/status/rows.
- Priority products only (10–15 signed-off list in `config/priority_products.yaml`), capture the priority set first (a test scrape saw 51 Paper Boat SKUs).
- Save the **raw response** (JSONB + compressed object store) before parsing; parsing must be re-runnable from raw.
- Concurrency with asyncio; cap per-location concurrency; retry with backoff; no CAPTCHA bypass; detect blocks and mark run `blocked`.

## Fields
Exactly the columns in `rules/data-contract.md` (taken from the real CSV). Where a field is genuinely absent (e.g. `not_listed`), store NULL **and** a reason (`absent_reason`).

## Database
- Hypertable `listing_snapshots` on `scraped_at`; mutable tables for locations/products.
- Continuous aggregates for dashboard rollups.
- Migrations via Alembic; no manual schema edits.

## API (FastAPI)
- One interface serves dashboard AND assistant — a figure must never differ between them.
- OpenAPI auto-generated; version prefix `/api/v1`.
- Filters on every list endpoint: `city`, `location`(store_id/pincode), `product_id`, `keyword`, `from`, `to`.
- Responses are JSON, snake_case, include `captured_at` and `is_estimate` where relevant; CORS allow the frontend dev origin.
- Pagination + sorting for the product table; `GET …/export.csv` for export.

## Data quality (must ship)
Missing fields, unusual prices (e.g. selling_price > mrp, ±X% jump vs previous run), stale run (no run in >N hours), blocked requests. Expose as `GET /api/v1/quality/issues` so the UI can warn "figure cannot be trusted".

## Sell-out estimate
`est_units_sold = max(0, prev_stock − stock)` between consecutive captures at a location, excluding restocks (stock increases); always labelled estimate.

## Tests
pytest + parser tests built from stored raw samples; API contract test against OpenAPI.
