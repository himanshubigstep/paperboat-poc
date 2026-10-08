# Backend rules — Jeetpal

Stack: Python 3.13 (async), Playwright + headless Chromium, **Supabase-hosted PostgreSQL (POC — D-024, no TimescaleDB extension on hosted Supabase)**, FastAPI. Dir: `backend/`. Scheduler: **GitHub Actions scheduled workflow** (`.github/workflows/capture.yml`), not a cron/systemd timer on a dedicated host (D-024 supersedes D-002's hosting choice and all of D-020 for the POC).

## Capture job
- Target: **Blinkit**, **every delivery location (store/pincode) in Delhi and Mumbai**, not only 110005 / 400050 (they were the only ones in the first test scrape). First task: enumerate and persist the location list (`locations` table: pincode, city, store_id, store_name, store_address, lat/lng if available); report the count.
- One adapter module `adapters/blinkit.py`; platform-specific logic never leaks outside it.
- Schedule 3×/day (06:00, 12:00, 20:00 IST, D-019) via a GitHub Actions `schedule:` cron trigger plus `workflow_dispatch` for manual reruns (D-024). Each run gets a `run_id`; log started/finished/status/rows. GitHub Actions cron is best-effort and a scheduled workflow is disabled after 60 days with no repo commits — see plan Risk 4 for mitigation.
- Priority products only (10–15 signed-off list in `config/priority_products.yaml`), capture the priority set first (a test scrape saw 51 Paper Boat SKUs).
- Save the **raw response** (JSONB in `raw_responses`) before parsing; parsing must be re-runnable from raw. No local file copy in CI — the GitHub Actions runner is ephemeral, so JSONB in Supabase is the only durable copy (D-024).
- Concurrency with asyncio; cap per-location concurrency; retry with backoff; no CAPTCHA bypass; detect blocks and mark run `blocked`.

## Fields
Exactly the columns in `rules/data-contract.md` (taken from the real CSV). Where a field is genuinely absent (e.g. `not_listed`), store NULL **and** a reason (`absent_reason`).

## Database
- POC (D-024): plain Postgres table `listing_snapshots`, indexed on `scraped_at`, on Supabase — no `timescaledb` extension available on hosted Supabase; fine at POC volume (~250k rows / 4 weeks). Mutable tables for locations/products.
- Dashboard rollups via a materialized view (`listing_daily`), refreshed after each capture run — not a Timescale continuous aggregate.
- Migrations via Alembic; no manual schema edits. If the pilot scales past what a materialized-view refresh handles, revisit self-hosted TimescaleDB (original D-002 choice).

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
