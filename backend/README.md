# Backend (bootstrap)

Ported from `ecommerce-product-crawler` (the source of the first real Blinkit
test scrape, see `.claude/decisions.md` D-008). Blinkit-only: the Zepto
adapter and docs were dropped per D-001 (scope lock: Blinkit + Delhi +
Mumbai). No scrape output is committed here per D-005 — `data/`, `profiles/`,
`.venv/` are gitignored.

## What's here (as ported, unchanged behavior)
- `crawler/common.py` — `Product` dataclass, `Store` (dedupe + save JSONL/CSV), helpers
- `crawler/blinkit.py` — full-catalogue crawl (location via `gr_1_lat/lon` cookies)
- `crawler/blinkit_sku.py` — per-pincode SKU availability (`Session`, PDP/search parsing)
- `crawler/blinkit_rank.py` — search-rank capture (ads vs organic)
- `hector_catalog.py` — scrapes hectorbeverages.com for the Paper Boat product/keyword list
- `run.py`, `sku_run.py`, `rank_run.py` — CLIs, write timestamped CSV/JSONL to `data/`
- `config.py` — placeholder `LOCATIONS` (Karol Bagh / Bandra West only)
- `pincodes.csv`, `requirements.txt` (currently just `playwright`)

## Setup
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
.venv/bin/python sku_run.py --pincodes pincodes.csv
```

## Gap to `rules/backend.md` (not done yet)
This is still the standalone script crawler, not the FastAPI service the
rules call for. Still needed:
- Consolidate `crawler/blinkit*.py` into one `adapters/blinkit.py` module
- Enumerate every Blinkit delivery location in Delhi/Mumbai into a
  `locations` table (not the fixed list in `config.py`)
- Save raw responses (JSONB + object store) before parsing
- PostgreSQL + TimescaleDB (`listing_snapshots` hypertable), Alembic migrations
- 3×/day scheduler with `run_id` logging, priority-product config
  (`config/priority_products.yaml`)
- FastAPI app under `/api/v1` per the endpoint list in `rules/data-contract.md`
- `quality/issues` checks, sell-out estimate job
- pytest suite against stored raw samples + OpenAPI contract test

`requirements.txt` will need `fastapi`, `uvicorn`, `sqlalchemy`/`asyncpg`,
`alembic`, etc. added as that work lands.
