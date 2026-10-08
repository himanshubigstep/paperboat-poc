# Plan: Backend for the Paper Boat POC (Blinkit, Delhi + Mumbai)

Owner: Jeetpal (backend). Covers every sheet line P0.1 to P6.2 from the backend side.
R.I.C.E. protocol: not configured in this repo (`bstack-rice path` exit 1). Run `/bstack:rice-init` if wanted; not blocking.
Revision 2 (2026-10-08): adds P0.1 success measures, shared environment, week-1 OpenAPI stub (D-005), backend support for P3/P4, P5 verification/demo/handover, P6 tracking. Task IDs from revision 1 are unchanged.
Revision 3 (2026-10-08): POC infra swap per D-024 — scheduler is a GitHub Actions workflow (not cron/systemd on a dedicated host); database is a Supabase Postgres project (not self-hosted TimescaleDB). Supersedes the hosting half of D-002 and all of D-020 for the POC. Task IDs unchanged; T0.1, T0.3, T0.6, T1.9, T1.14, T2.1 and the Data Layer section are revised in place.

## Sheet coverage

| Sheet item | Backend tasks | Backend done when |
|---|---|---|
| P0.1 Kick-off, success measures | T0.0 | Measures in `docs/pilot/success-measures.md`, each tied to a query or report |
| P0.2 Cities, stores, priority products | T1.2, T1.3, T1.5, T1.6, T1.7, T1.8 | Store + pincode CSV produced; `priority_products.yaml` signed off |
| P0.3 Contract, schema, environment | T0.1, T0.2, T0.3, T0.4, T0.5, T0.6 | Contract FROZEN; `0001_initial` applied on the Supabase project; stub API reachable by team |
| P1.1 Location discovery | T1.3, T1.4, T1.5 | Location list in DB, `pb locations discover` reruns cleanly, count vs assumption logged |
| P1.2 Listing capture | T1.10 | One city, every contract field set or `absent_reason` |
| P1.3 Detail capture | T1.11 | shelf_life, marketer, store_address present or reasoned |
| P1.4 Search rank + sponsored | T1.12 | Rank + `is_sponsored` per keyword x store; 20-card live check recorded |
| P1.5 Scale, retries, proxy | T1.13 | Both cities in one window; failures retried and logged |
| P1.6 3x/day + run log | T1.14 | GitHub Actions workflow runs unattended 3x/day; `GET /runs` shows outcome + coverage |
| P2.1 DB + time-series | T0.3, T2.1 | Full capture loads and reads back on Supabase (plain tables, no Timescale) |
| P2.2 Derived measures | T2.2, T2.5 | Hand-checked case file passes on backend and frontend |
| P2.3 Data interface | T2.3, T2.4, T2.5, T2.6, T2.9 | OpenAPI published; frontend + assistant on it |
| P2.4 Quality + run status | T2.7 | Broken run caught by test and on shared env |
| P3.1-P3.7 Dashboard | T3.1, T3.2 (support only) | Every screen's figure has an endpoint; freshness per city served |
| P4.1-P4.6 AI layer | T2.8, T4.1, T4.2, T4.3 (support only) | Gateway routes live; AI tools read the same API; run hook fires |
| P5.1 Accuracy check | T5.1 | 30 sampled figures reconcile; discrepancies closed |
| P5.2 End-to-end tests | T5.2 | Capture to API flow test green in CI; no open high defects |
| P5.3 Demo | T5.3 | Runbook + pre-demo checklist; live data on demo day |
| P5.4 Outcome report | T2.11, T5.4 | Measured volumes vs planning assumptions delivered |
| P6.1 Weekly status | T6.1 | `pb report weekly` output in each review |
| P6.2 Risks, dependencies | T6.2 | `docs/pilot/open-items.md` reviewed weekly |

Not backend: dashboard screens (Himanshu), assistant prompts, rules, eval set (Gajendra).

## Input

- Typed request (2026-10-08, revision 2): backend plan for one platform, two cities, against the full sheet P0.1 to P6.2 (pasted in the request).
- Revision 1 request: first outputs are (1) every Blinkit dark store in Delhi and Mumbai with id, address, pincodes served; (2) the Paper Boat master product list driving the crawl.
- Authoritative rules: `.claude/rules/{general,backend,data-contract,ai}.md`, `.claude/decisions.md` (D-001 Blinkit only, D-002 stack, D-004 keep raw, D-005 no data files + week-1 stub, D-010 AI hosting open, D-012 every capture returned).
- Existing code: `backend/crawler/blinkit_sku.py` (pincode location, store row, PDP parser), `backend/crawler/blinkit_rank.py` (search rank, ad flag). They produced the 2026-09-29 test scrape (D-008). No `backend/app/` yet; no `ai-layer/` yet.
- Existing consumer: `frontend/src/lib/api.ts:31` calls `GET /snapshots`, reads `json.data` as `{snapshots, meta}`. `Snapshot` in `frontend/src/lib/types.ts:18` has `platform`, `line`, `capture_id`. Slots `CAPTURE_SLOTS_UTC = ['00:30','06:30','14:30']` = 06:00 / 12:00 / 20:00 IST (`frontend/src/lib/config.ts:34`).

## Rollback Path

- All work is additive under `backend/` and a new Supabase project. Frontend and AI layer only switch when they set `NEXT_PUBLIC_USE_MOCK=false` / point at the real base URL. Rollback for consumers = point back at the stub (T0.5) or mocks.
- Schema: every Alembic migration has a working `downgrade()`. The DB is new; worst case `alembic downgrade base` and reload from raw responses (D-004, `pb reparse`).
- Capture: disable by disabling the `.github/workflows/capture.yml` schedule (repo Settings -> Actions, or delete the `schedule:` trigger) — no server to stop. Runs hold a Postgres advisory lock on the Supabase connection, so an overrunning run never overlaps the next, even across two separate Actions runners.
- AI gateway (T4.1): routes are a reverse proxy; removing the router include restores the previous API with no data change.
- Legacy scripts (`backend/crawler/`, `run.py`, `sku_run.py`, `rank_run.py`) stay until parser parity passes (T2.10).
- One-way doors: none. Raw retention is 90 days (T2.1), longer than the POC. Deleting legacy code (T2.10) is recoverable from git.

## Scope Decisions

**Minimum viable scope by end of week 1:** T0.0-T0.6 + T1.1-T1.8. Yields success measures, frozen contract, stub API the frontend and AI layer can build on, shared environment, dark-store CSV, Paper Boat catalogue, draft priority list.

**Complexity trigger hit** (40+ files, several modules, one gateway). Justified: every task maps to a sheet line, and each phase ends in something usable, so work can stop after any phase. Smallest per-item scope is used: AI support is a proxy + a schema + a hook, not shared code.

**Decisions** (D-015 to D-020 already logged as Proposed; D-021 to D-023 added by this revision):

| # | Decision | Why |
|---|---|---|
| D-015 | Capture unit is the dark store (`store_id`); `pincode_stores` maps pincodes to stores; each run visits each primary store once via a representative pincode. | Price and stock are per store; visiting every pincode repeats work. |
| D-016 | Location seeds from India Post pincodes (Delhi all districts; Mumbai City + Suburban), optional lat/lng grid pass. | No public store list. |
| D-017 | Listing fields from brand search results; PDP once per product x store per day for detail, and to confirm a priority SKU missing from search. | Search cards already carry price, MRP, inventory, sold-out (`blinkit_rank.py:85`). About 10x fewer page loads. |
| D-018 | Master catalogue = all Paper Boat products in both cities, `is_drink` flag, `category_l1/l2/l3`. Priority 10-15 picked from it. | User asked for all products with category and subcategory. |
| D-019 | Slots 06:00 / 12:00 / 20:00 IST; `capture_id = <IST date>-S<1..3>`; rank once a day (S2) unless timing allows 3x. | Matches the frontend; rank volume = stores x keywords. |
| D-020 | ~~cron / systemd timer calling the CLI; advisory lock.~~ Superseded by D-024 for the POC (GitHub Actions). | Fewest moving parts on one server — moot once there is no server. |
| D-024 | POC runs the capture job as a GitHub Actions scheduled workflow (3x/day) against a **Supabase** Postgres project, not a self-hosted VM + TimescaleDB. Plain tables (no `timescaledb` extension — unsupported on hosted Supabase), indexed on `scraped_at`; fine at POC volume (~252k listing rows / 4 weeks). Advisory lock still works (lock lives in Postgres, not on a runner). Raw responses stored as JSONB only, no local gzip backup (runners are ephemeral). | Zero hosting to manage during the pilot; Supabase gives Postgres + a GUI + backups for free-tier volume. Revisit a dedicated host (D-002) if block rate or data volume outgrows this, per `docs/pilot/scaling-notes.md`. |
| D-021 | Week-1 stub = the real FastAPI app with Pydantic response models; spec exported to `backend/openapi.json`; mock served by Prism (`npx @stoplight/prism-cli mock openapi.json`) from schema examples. | Honours D-005 (stub in week 1, no data files). The stub and the real API share one schema, so nothing drifts. |
| D-022 | AI layer runs as its own service (`ai-layer/`, Gajendra). Backend exposes `/assistant/*` and `/recommendations*` by reverse proxy, so the frontend has one base URL. AI tools call the backend HTTP API, not SQL, for any figure the dashboard also shows. The read-only DB role (T2.8) is for ad-hoc SELECTs only. Recommendations, explanations, chat sessions live in schema `ai`, written by role `pb_ai`. | Closes D-010. "A figure must never differ between dashboard and assistant" (`backend.md`) is met by construction when both read the same endpoint. |
| D-023 | Pilot success measures (P0.1) are proposed in T0.0 and agreed at kick-off; each one is computed by `pb report` from the DB. | A measure nobody can query cannot be judged at the demo. |

**Out of scope here:** dashboard screens, assistant prompts and rules, other platforms (D-001), CAPTCHA solving (general rule 7), Part B items (approvals, Airflow).

## Affected Apps / Libs

| Area | Change | Blast radius | Reversible | Owner in prod |
|---|---|---|---|---|
| `backend/` (new `app/` package) | All new code | Backend only | Yes | Jeetpal |
| Supabase Postgres project (new) | Schema via Alembic, schemas `public` + `ai`, plain tables (no Timescale) | New DB | Yes (`downgrade`) | Jeetpal |
| `.github/workflows/capture.yml` (new) | Scheduled + manual capture runs | GH Actions only | Yes (disable schedule) | Jeetpal |
| `backend/openapi.json` | Published spec; frontend and AI generate clients from it | Frontend + AI builds | Yes, by PR | Jeetpal; reviewed by Himanshu + Gajendra |
| `.claude/rules/data-contract.md` | Freeze (T0.4) | Frontend + AI build against it | Yes, by PR | Jeetpal |
| `.claude/decisions.md` | Append D-021 to D-023; move D-015 to D-023 to Accepted at T0.4 | Docs | Yes | Jeetpal |
| `docs/pilot/` (new) | Success measures, open items, accuracy log, runbook | Docs | Yes | Jeetpal + PM |
| `frontend/src/lib/api.ts` | Not changed here. Envelope mismatch flagged (Risk 3). | | | Himanshu |
| `ai-layer/` | Not changed here. Gateway target and `ai` schema provided. | | | Gajendra |

No Nx/DDD boundaries (Python service). Boundary that matters: Blinkit-specific code only in `app/adapters/blinkit.py` (`backend.md`).
Two-week smell test: (1) two parsers alive at once until T2.10; (2) no API auth (decide before P5.3).

## Architecture Diagram

```
  GitHub Actions workflow .github/workflows/capture.yml
  schedule: cron '30 0,6,14 * * *'  (UTC = 06:00 / 12:00 / 20:00 IST)
  + workflow_dispatch (manual rerun button)
                                |
                                v
  runner (ubuntu-latest, ephemeral): checkout -> setup-python -> pip install
  -> playwright install chromium (actions/cache by lockfile hash)
  -> pb capture run --slot auto   [env: SUPABASE_DB_URL, AI_HOOK_URL, PROXY_URL
                                    read from GitHub Actions encrypted secrets]
                                |
                                v
  pb CLI (typer) -- locations | catalogue | capture run | rank run | reparse | report | verify
                                |
                                v
        app/capture/runner.py (asyncio pool, MAX_CONTEXTS, 1 context per store,
                                |  retry x3 + backoff, block detection,
                                |  advisory lock on the Supabase conn, capture_runs row)
                                v
        app/adapters/blinkit.py (ONLY Blinkit code; Playwright Chromium -> blinkit.com,
                                |  optional PROXY_URL)
              +-----------------+------------------+
              v                                    v
     app/capture/raw.py                    pure parsers (dict in, dataclass out)
     raw_responses (JSONB only;                     |
     no local gzip file -- runner is ephemeral)     |
              |   pb reparse --run-id               v
              +-------------------------> Supabase Postgres (hosted, no Timescale ext.)
                                            public: locations, stores, pincode_stores,
                                                    products, listing_snapshots (plain
                                                    table, index on scraped_at),
                                                    search_rank_snapshots (plain table),
                                                    capture_runs, query_log,
                                                    listing_daily (materialized view,
                                                    REFRESH after each run, T2.1)
                                            ai:     recommendations, explanations,
                                                    chat_sessions (written by pb_ai)
              run finished                         |
              -> quality checks (T2.7)              v
              -> POST AI_HOOK_URL (T4.3)   app/api  FastAPI /api/v1  (OpenAPI -> openapi.json)
                 (failure logged, not fatal)  hosted separately (T0.6), reads the same
                                              Supabase DB the workflow writes to
                                              /snapshots /locations /products(.csv) /summary
                                              /availability /sellout /price-discount
                                              /search-rank /cities/compare /quality/issues
                                              /runs /freshness /query/{id} /healthz
                                              /assistant/* /recommendations*  --proxy--> ai-layer
                                                  |                                  |
                                                  v                                  | tools call
                                          frontend (Next.js)                         | backend HTTP
                                                                                     v
                                                                        ai-layer (FastAPI, Claude API)
                                                                        ad-hoc SELECT via pb_readonly
                                                                        (Supabase conn string)

  Week 1 only: Prism mock of openapi.json  -> frontend + ai-layer build before real data

Failure paths:
  page load fails 3x          -> store failed in capture_runs, re-queued once at end of run
  403/429/captcha markers     -> run status blocked, remaining stores skipped, quality issue
  priority SKU not in search  -> PDP check -> available | out_of_stock | not_listed + absent_reason
  parser error                -> raw kept; fix parser; pb reparse --run-id
  scheduled run late/skipped  -> GitHub Actions cron is best-effort (Risk 4); /freshness shows
                                 stale; workflow_dispatch reruns it by hand
  ai-layer down               -> gateway returns 503 with {error:"assistant_unavailable"}; data API unaffected
  AI hook fails               -> logged on capture_runs.error_summary; ai-layer nightly batch catches up
```

## Tasks

About 30 min per task for one agent unless marked (S) spike or (H) human gate.

### Phase 0: Kick-off, contract, environment (P0.1-P0.3)

**T0.0 (H) Success measures and planning assumptions (P0.1)**
- Create: `docs/pilot/success-measures.md`, `backend/config/capture.yaml` (planning assumptions: expected stores per city, captures per day, rows per run, run window minutes).
- Proposed measures, each with the query or report that produces it:
  - Location coverage: stores captured per run / active stores, target >= 95% (`capture_runs`).
  - Run reliability: runs with status `ok` / scheduled runs, target >= 90% over the last 7 days (`pb report weekly`).
  - Field completeness: rows with a null contract field and no `absent_reason`, target 0 (`/quality/issues`).
  - Run duration: p95 below the window in `capture.yaml` (`capture_runs.duration_s`).
  - Figure parity: dashboard vs assistant vs DB on the golden set, target 100% (T4.2 parity test).
  - Accuracy: 30 sampled records vs live app, 0 open discrepancies (T5.1).
  - API: p95 latency < 500 ms on `/summary` and `/products` at 4 weeks of history.
- Gate: agreed in writing at kick-off; review slots for weeks 1-4 booked (PM).
- Tests: none (doc); `capture.yaml` validated by `tests/test_config.py` once T0.1 lands.
- Deps: none. Completeness: 7/10 (needs business agreement).

**T0.1 Project skeleton**
- Create: `backend/pyproject.toml` (Python 3.13; fastapi, uvicorn[standard], sqlalchemy[asyncio]>=2, asyncpg, alembic, pydantic-settings, playwright, typer, pyyaml, httpx; dev: pytest, pytest-asyncio, ruff, schemathesis), `backend/app/__init__.py`, `backend/app/settings.py` (`DATABASE_URL` — the Supabase pooled/session connection string, `RAW_DIR` local-dev-only, `PROXY_URL`, `MAX_CONTEXTS`, `PAGE_DELAY_MIN/MAX`, `CORS_ORIGINS`, `AI_BASE_URL`, `AI_HOOK_URL`), `backend/.env.example`, `backend/docker-compose.yml` (local dev only: plain `postgres:16` + api, so a contributor can run tests without a Supabase project; CI and the capture workflow talk to Supabase directly), `backend/Dockerfile` (for the API host, not the capture job), `backend/tests/conftest.py`.
- Modify: `backend/README.md`, `backend/.gitignore` (add `raw/`, `data/`).
- Tests: `tests/test_settings.py` (env loads, defaults, missing `DATABASE_URL` fails fast).
- Deps: none. Parallel with T0.2. Completeness: 8/10.

**T0.2 (S) Spike: confirm Blinkit behaviour, save fixtures**
- One store end to end with the legacy `Session`; dump raw JSON for `/location/info`, `/visibility`, `/v1/consumerweb/eta`, `/v1/layout/search` ("paper boat"), `/v1/layout/product/<id>` (available, OOS, not listed).
- Answer: (a) does `/visibility` carry merchant lat/lng/address? (b) cookie-only location (`gr_1_lat/lon`) vs pincode UI give the same store? (c) do search cards carry `inventory` for every PB product? (d) seconds per store for search vs PDP.
- Create: `backend/tests/fixtures/blinkit/*.json` (trimmed to parsed fields; parser fixtures, not datasets, D-005 unaffected), `docs/plans/2026-10-08-blinkit-spike-notes.md`.
- Deps: none. Completeness: 7/10.

**T0.3 Alembic + initial schema (Supabase, plain Postgres)**
- Create: `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/versions/0001_initial.py`, `backend/app/db.py`, `backend/app/models.py`. Tables in Data Layer; **plain tables, not hypertables** — Supabase's hosted Postgres does not offer the `timescaledb` extension, and POC volume (~252k listing rows / 4 weeks) does not need it. B-tree index on `(store_id, product_id, scraped_at desc)` for sell-out, `(scraped_at)` on each snapshot table.
- Alembic connects straight to `SUPABASE_DB_URL` (same string the workflow uses); runs fine from a GitHub Actions step (`alembic upgrade head`) or a contributor's laptop.
- Tests: `tests/test_migrations.py` (upgrade head, downgrade base, upgrade again) against a local plain Postgres container in CI — same engine family as Supabase, no extension dependency.
- Deps: T0.1. Completeness: 8/10.

**T0.4 (H) Freeze data contract**
- Modify: `.claude/rules/data-contract.md` (status FROZEN; listing adds `platform`, `capture_id`, `line`, `source` (`search`|`pdp`); products adds `category_l1/l2/l3`, `is_drink`, `is_priority`; locations/stores shapes; `/snapshots` envelope per Risk 3; `/freshness`, `/runs`, gateway routes), `.claude/decisions.md` (D-015 to D-023 to Accepted or revised).
- Review: Himanshu + Gajendra (general rule 2).
- Deps: T0.2. Completeness: 7/10.

**T0.5 Week-1 API stub from real schemas (D-021)**
- Create: `backend/app/api/main.py`, `backend/app/api/schemas.py` (Pydantic response models for every endpoint in the contract, with `json_schema_extra` examples built from the D-008 sample facts: pincodes 110005/400050, the 3 availability states, a not_listed row with nulls), route stubs raising 501 (filled in T2.4-T2.7), `backend/app/cli.py` command `pb api openapi > backend/openapi.json`, `backend/Makefile` target `mock` (Prism on port 4010).
- Tests: `tests/api/test_openapi_export.py` (spec exports, every contract endpoint present under `/api/v1`, every response has an example, envelope shape `{data, meta}`).
- Deps: T0.1. Parallel with T0.2/T0.3. Completeness: 8/10.

**T0.6 Shared environment (P0.3): Supabase project + API host + Actions secrets**
- Create a Supabase project (free/pro tier sized to POC volume); run `0001_initial` against it. Only the capture workflow and the API need write access — add a connection-pooled URL (`SUPABASE_DB_URL`, PgBouncer transaction mode) for the API (many short-lived connections) and a direct/session URL for the capture job and Alembic (needs a session-scoped advisory lock, T1.13).
- Store `SUPABASE_DB_URL`, `PROXY_URL`, `AI_HOOK_URL` as **GitHub Actions encrypted secrets** (repo Settings -> Secrets and variables -> Actions) — never in the workflow YAML or committed `.env` (general rule 6). The API host (wherever T0.6 deploys it — Fly.io/Render/a small VM, decide with PM) gets the same values via its own secret store.
- Create: `backend/ops/deploy.md` (API host setup: one process, `uvicorn app.api.main:app`, env from its platform's secret manager), `backend/ops/backup.md` (Supabase takes daily backups on paid tiers; note the retention tier chosen and how to restore — `pg_dump` to object storage only if on the free tier with no PITR), `backend/app/api/routes/health.py` (`GET /healthz`: DB reachable, last run age).
- Access: API has no auth yet (open item, decide before P5.3); Supabase project access restricted to the team via its dashboard roles.
- Tests: `tests/api/test_health.py` (DB down -> 503, OK -> 200 with last run age).
- Gate: Himanshu and Gajendra each hit `/healthz` and the Prism mock from their machines; one of them runs `alembic upgrade head` against a throwaway Supabase branch/project to confirm no extension surprises.
- Deps: T0.1, T0.3. Completeness: 7/10 (API host choice is an open item).

### Phase 1A: Dark-store list and Paper Boat catalogue (P0.2, P1.1)

**T1.1 Blinkit adapter**
- Create: `backend/app/adapters/__init__.py`, `backend/app/adapters/blinkit.py`. Move from legacy: `Session` (`blinkit_sku.py:117`), `parse_pdp` (`:68`), `_store_row` (`:191`), `is_hector_drink` (`:109`), `parse_card` + `rank_cards` (`blinkit_rank.py:85`, `:141`). Split pure parsers from browser actions (`set_pincode`, `set_latlng`, `search`, `fetch_product`). Every response goes to an `on_raw(kind, url, payload)` callback (T1.9).
- Add: `parse_search_listing(snippets) -> list[ListingCard]`, `split_category("A > B > C") -> (l1, l2, l3)`.
- Tests: `tests/adapters/test_blinkit_parsers.py` on T0.2 fixtures: PDP available / OOS / not listed, ad vs organic card, related-section switch, repeat flag, category 1-4 levels, rupee with commas.
- Deps: T0.2. Completeness: 9/10.

**T1.2 Pincode seed list**
- Create: `backend/config/seeds/pincodes.csv` (`pincode, city, district, lat, lng, source`) from the India Post directory (data.gov.in). Replaces `backend/pincodes.csv`. Reference config, not captured data.
- Tests: `tests/test_seeds.py` (6 digits, unique, city in {Delhi, Mumbai}, prefix matches city).
- Deps: none. Completeness: 8/10.

**T1.3 Location discovery job (P1.1)**
- Create: `backend/app/capture/locations.py`, CLI `pb locations discover [--city] [--limit]`.
- Per seed pincode: set location, parse store row + merchants from `/visibility`, upsert `locations`, `stores`, `pincode_stores(role)`. New primary store: one PB PDP for seller name/address/FSSAI (`blinkit_sku.py:86`). Unserviceable pincodes kept with `serviceable=false`. `stores.representative_pincode` = first serviceable pincode mapped to it.
- Log + `capture_runs` row (kind `locations`): pincodes tried, serviceable, unique stores per city, count vs `capture.yaml` assumption.
- Tests: `tests/capture/test_locations.py` (fake adapter): idempotent rerun, shared store stored once, unserviceable kept, vanished store `active=false`.
- Deps: T0.3, T1.1, T1.2. Completeness: 8/10.

**T1.4 Grid pass (only if coverage is in doubt)**
- Modify: `app/capture/locations.py` (`--grid 2km`): lat/lng grid per city box via cookies; stop after 3 rows with no new store.
- Tests: grid bounds and spacing; saturation stop.
- Deps: T1.3, T0.2(b). Completeness: 7/10.

**T1.5 Dark-store CSV export**
- Create: `backend/app/exports.py`, CLI `pb locations export` (to gitignored `backend/data/`): `blinkit_dark_stores_<ts>.csv`, `blinkit_pincodes_<ts>.csv` (columns as revision 1).
- Tests: `tests/test_exports.py` (headers, pincode list joined, empty DB writes header only).
- Deps: T1.3. Completeness: 9/10.

**T1.6 Paper Boat catalogue job**
- Create: `backend/app/capture/catalogue.py`, CLI `pb catalogue build [--city] [--stores N]`.
- Per active store: brand searches; union PB `product_id`s; PDP once per new product (name, pack, breadcrumbs, marketer, shelf life, `is_drink`, `line` ported from `frontend/src/lib/metrics.ts:132`). Store-level cards written as `listing_snapshots` (`source='search'`), so the run is also a first capture.
- Tests: `tests/capture/test_catalogue.py`: PB filter (brand prefix, marketer fallback, non-drink kept), dedupe, one PDP per product, `line` parity with TS on 15 names.
- Deps: T1.3, T1.9 first. Completeness: 8/10.

**T1.7 Catalogue CSV export**
- Modify: `app/exports.py`, CLI `pb catalogue export`: `paperboat_products_<ts>.csv`, `paperboat_product_stores_<ts>.csv` (columns as revision 1).
- Tests: seeded DB (one product, 3 stores, 2 cities, one OOS) gives expected counts and price range.
- Deps: T1.6. Completeness: 9/10.

**T1.8 (H) Draft priority list (P0.2)**
- Create: `backend/config/priority_products.yaml` via `pb catalogue suggest-priority --n 15` (listed in both cities, one per `line`, prefer 200 ml and 1 L). Business signs off; file gets `signed_off: <date, name>`.
- Tests: `tests/test_config.py` (10-15 ids, all in `products`, `signed_off` present before the scheduler enables priority-only mode).
- Deps: T1.7. Completeness: 7/10.

### Phase 1B: Recurring capture (P1.2-P1.6)

**T1.9 Raw response store (revised for ephemeral runners, D-024)**
- Create: `backend/app/capture/raw.py`, CLI `pb reparse --run-id`. Insert into `raw_responses` (Supabase, JSONB) only — **no local `RAW_DIR/<run_id>/*.jsonl.gz` file in CI**, because a GitHub Actions runner is destroyed at the end of each job and that file would be lost. D-004 ("keep the raw response") is satisfied by the JSONB row alone. `RAW_DIR` stays as a local-dev convenience (T0.2 spike, debugging a parser on a laptop), gated behind `settings.RAW_DIR is not None`.
- `pb reparse --run-id` rebuilds `listing_snapshots` / `search_rank_snapshots` for a run from `raw_responses` only, in one transaction.
- Tests: round trip, idempotent reparse, corrupt row skipped and counted, reparse works with `RAW_DIR` unset.
- Deps: T0.3, T1.1. Completeness: 9/10.

**T1.10 Listing capture (P1.2)**
- Create: `backend/app/capture/listings.py`. Cards to `listing_snapshots` for priority SKUs (all PB if `capture.all_pb: true`). Missing priority SKU: PDP check -> `available`, `out_of_stock`, or `not_listed` + `absent_reason='not_listed_at_store'`. `city` = `Delhi`/`Mumbai`; `platform='blinkit'`.
- Tests: `tests/capture/test_listings.py`: card mapping, OOS via `is_sold_out` and `inventory=0`, 3 missing-SKU outcomes, `stock=0` when OOS, price > MRP kept.
- Deps: T1.1, T1.8 (or all-PB mode), T1.9. Completeness: 9/10.

**T1.11 Detail enrichment (P1.3)**
- Modify: `app/capture/listings.py`. First slot of IST day: PDP per priority product x store. Later slots copy forward within 24 h, else null + `absent_reason='detail_not_captured'`; absent on PDP -> `absent_on_pdp:<field>`.
- Tests: 23 h copies, 25 h does not; absent reason; not_listed detail nulls carry reason.
- Deps: T1.10. Completeness: 8/10.

**T1.12 Search rank capture (P1.4)**
- Create: `backend/app/capture/rank.py`, `backend/config/keywords.yaml` (10-20 agreed keywords, `type: generic|hinglish|misspelling`). Per store x keyword -> `search_rank_snapshots`. Once a day (S2), D-019.
- Accuracy: `pb rank verify --sample 20`; a person checks the live app, records in `docs/pilot/rank-verification.md`.
- Tests: ad cards (`monet_product_listing`, badge `AD`), related section, auto-corrected query, repeated product.
- Deps: T1.1, T1.9. Completeness: 8/10.

**T1.13 Runner, retries, blocks, proxy (P1.5)**
- Create: `backend/app/capture/runner.py`. Pool of `MAX_CONTEXTS` (default 4) contexts, per-store concurrency 1; 3 attempts with 10/30/90 s backoff + jitter; failed stores re-queued once. Block = 403/429, challenge markers, empty `/location/info` twice -> run `blocked`, stop. `PROXY_URL` from env only. `capture_runs` columns in Data Layer.
- Tests: `tests/capture/test_runner.py` (fake adapter): retry then ok; always fails -> `partial`; 429 -> `blocked`, rest skipped; concurrency cap holds.
- Deps: T1.10, T1.12. Completeness: 9/10.

**T1.14 Scheduling and run logging (P1.6): GitHub Actions workflow**
- Create: `.github/workflows/capture.yml`:
  - `on: schedule: [{cron: '30 0,6,14 * * *'}]` (UTC; = 06:00 / 12:00 / 20:00 IST, matches `frontend/src/lib/config.ts:34`) `+ workflow_dispatch:` with an optional `slot` input for manual reruns.
  - Steps: `actions/checkout`, `actions/setup-python@v5` (3.13), `pip install -e backend[capture]` (cached via `actions/cache` on the lockfile hash), `playwright install --with-deps chromium` (cached the same way — this is the slow step and worth caching), `pb capture run --slot auto`.
  - `env:` pulls `SUPABASE_DB_URL`, `AI_HOOK_URL`, `PROXY_URL` (optional) from `secrets.*`; nothing else needs a secret.
  - `concurrency: { group: pb-capture, cancel-in-progress: false }` so two triggers (schedule + a manual rerun) can't race the same minute; the Postgres advisory lock (T1.13) is the real guard since GH's `concurrency` only prevents overlap within this repo's own Actions, not a second trigger from elsewhere.
  - Keep-alive: GitHub disables a scheduled workflow after **60 days with no repository activity**. Add a step comment / README note that any commit resets the clock; if the repo goes quiet, a trivial weekly commit (e.g. `pb report weekly` output committed to `docs/pilot/`) keeps it alive incidentally (T6.1).
- `pb runs list` (CLI, reads `capture_runs`) stays as-is — it works the same against Supabase as any Postgres.
- Tests: slot resolution at 05:59 / 06:00 / 11:59 / 20:00 IST; overlap skipped (advisory lock held by a concurrent fake run); workflow YAML linted with `actionlint` in CI.
- Deps: T1.13. Completeness: 8/10.

### Phase 2: Data foundation, metrics, API (P2.1-P2.4)

**T2.1 Rollups and retention (P2.1, revised — no Timescale on Supabase)**: `0002_rollups.py`: `listing_daily` as a plain **materialized view** (IST day x city x store x product: min/avg/max selling_price, avg discount, captures, captures_available, last_stock), `REFRESH MATERIALIZED VIEW CONCURRENTLY listing_daily` called at the end of every capture run (T1.13/T1.14) instead of Timescale's automatic continuous-aggregate refresh. Retention: a `pb retention sweep` CLI command (run weekly via the same GH Actions workflow with a second `schedule` entry, or folded into the nightly AI hook run) deletes `raw_responses` older than 90 days — no compression tier available, so this is delete-only; fine at POC volume (~1.7M rank rows + 252k listing rows over 4 weeks is a few hundred MB, well under Supabase free-tier limits). Note in `docs/pilot/scaling-notes.md`: moving to self-hosted Timescale (D-002) buys automatic compression and continuous aggregates if volume or history length grows past what a materialized view refresh can keep up with.
- Tests: migration up/down; view returns expected rollups on seeded data; `pb retention sweep --dry-run` reports what it would delete without deleting.
- Deps: T0.3. Completeness: 8/10.

**T2.2 Derived measures (P2.2)**: `backend/app/metrics.py` (`discount_pct`, `sellout_intervals`, `product_line`), matching `SelloutInterval` (`frontend/src/lib/types.ts:44`). Shared case file `backend/tests/fixtures/metrics_cases.json` run by both `tests/test_metrics.py` and the frontend's Vitest (Himanshu adds the TS runner). Cases: drop, restock, drop after restock, OOS both ends, gap, MRP null/0, price > MRP. Deps: none. Completeness: 10/10.

**T2.3 API core**: `app/api/deps.py` (filters `city`, `store_id|pincode`, `product_id`, `keyword`, `from`, `to`, `page`, `page_size`, `sort`), `app/api/envelope.py`, `app/api/routes/query.py` (`GET /query/{id}`), `query_log` writer used by every data route (each response's `meta.query_id`). CORS from `CORS_ORIGINS`. Tests: envelope, 422 on bad filters, `/query/{id}` returns SQL + params + rows. Deps: T0.5. Completeness: 8/10.

**T2.4 First live endpoints (P2.3)**: `/snapshots`, `/locations`, `/products`, `/products/export.csv` replace the T0.5 stubs. Tests on seeded DB: filters, totals, not_listed nulls, CSV header + rows, UTC returned. Deps: T2.3, T1.10 or seed. Completeness: 9/10.

**T2.5 Measure endpoints**: `/summary`, `/availability`, `/sellout` (`is_estimate: true` in meta and rows, field `est_units_sold`), `/price-discount`, `/cities/compare`. Tests reconcile with `app/metrics.py`; empty range -> `data: []` + meta. Deps: T2.2, T2.4. Completeness: 9/10.

**T2.6 `/search-rank`**: rank, organic_rank, is_sponsored, section, shown_query; filter by keyword, paid/organic. Deps: T1.12, T2.3. Completeness: 8/10.

**T2.7 Data quality checks (P2.4)**: `app/quality.py`, routes `/quality/issues`, `/runs`; `config/quality.yaml` (`price_jump_pct: 30`, `stale_hours: 10`, `min_coverage_pct: 95`). Checks: null without reason, price > MRP, jump vs previous capture, stale, blocked/partial, coverage. Runs after every capture and on request. Test: deliberately broken run (429 + 3x price) returns both issues; repeat the same break on the shared env once (sheet acceptance). Deps: T1.13, T2.3. Completeness: 9/10.

**T2.8 Read-only role**: `0003_roles.py`: `pb_readonly` (SELECT on snapshot tables, views, cagg; `statement_timeout` 5 s), `pb_ai` (read same + write schema `ai` only). Tests: writes outside `ai` denied for both. Deps: T2.1. Completeness: 8/10.

**T2.9 OpenAPI contract test and publish**: schemathesis over all routes; `openapi.json` regenerated in CI and diffed (PR fails if spec changes without contract update). Deps: T2.4-T2.7. Completeness: 8/10.

**T2.10 Remove legacy crawler**: delete `backend/crawler/`, `run.py`, `sku_run.py`, `rank_run.py`, `config.py`, `pincodes.csv`; move `hector_catalog.py` to `backend/scripts/`. Gate: parser tests green + one store reconciles with legacy `sku_run.py`. Deps: T1.13. Completeness: 8/10.

**T2.11 Capture volume report**: `pb report volumes --from --to`: runs, stores per run, listings, PDP/search loads, p50/p95 duration, block/failure rate, vs `capture.yaml`. Tests on seeded `capture_runs`. Deps: T1.14. Completeness: 8/10.

### Phase 3: Dashboard support (P3.1-P3.7)

**T3.1 Freshness and screen gaps**
- Create: `app/api/routes/freshness.py` (`GET /freshness`: last ok capture per city, next scheduled slot, run status; feeds the header pill and footer "last capture <IST>").
- Walk each screen in `frontend.md` (Overview, Products, Availability, Search/Price, City comparison) with Himanshu; any figure with no endpoint gets a contract PR, not a client-side workaround. Expected: availability heatmap (product x store) as `GET /availability?group_by=store,product`.
- Tests: `tests/api/test_freshness.py` (no runs -> nulls + `stale: true`; one city stale, other fresh).
- Deps: T2.5, T2.7. Completeness: 8/10.

**T3.2 Live switch-over support (P3.7)**
- `/snapshots` envelope and size per Risk 3 (date range required, default 7 days; `page_size` max 5000). Load test with 4 weeks of synthetic rows in a test DB (generated in-test, not committed): `/summary` and `/products` p95 < 500 ms.
- Pair with Himanshu for one session when `NEXT_PUBLIC_USE_MOCK=false` goes on; log every mismatch as a contract PR.
- Tests: `tests/api/test_perf.py` (marked `slow`, not in default CI).
- Deps: T2.4, T2.5. Completeness: 7/10.

### Phase 4: AI layer support (P4.1-P4.6)

**T4.1 AI gateway routes (D-022)**
- Create: `app/api/routes/ai_proxy.py`: `POST /assistant/chat` (SSE streamed through with `httpx.AsyncClient.stream`), `GET /recommendations`, `GET /recommendations/{id}/explanation` proxied to `AI_BASE_URL`. Timeouts: 60 s for chat, 10 s otherwise. ai-layer down -> 503 `{error: "assistant_unavailable"}`.
- Tests: `tests/api/test_ai_proxy.py` with a fake upstream: SSE chunks pass in order, upstream 500 -> 502, unreachable -> 503, query params forwarded.
- Deps: T2.3. Completeness: 8/10.

**T4.2 Figure parity harness (P4.3, P4.4)**
- Create: `backend/tests/parity/` helper `assert_figure(endpoint, params, path, value)` exported as a small module Gajendra's golden-set runner imports, so each expected number is read from the live API, not hand-typed. Every API response carries `meta.query_id` (T2.3) so assistant citations resolve through `/query/{id}`.
- Tests: helper unit tests; one sample golden question ("% available in Mumbai on <date>") checked against `/summary` and SQL.
- Deps: T2.5. Completeness: 8/10.

**T4.3 Run-finished hook for recommendations (P4.1, P4.2)**
- Modify: `app/capture/runner.py`: after quality checks, `POST AI_HOOK_URL` with `{run_id, capture_id, status, quality_issue_count}`. Failure logged to `capture_runs.error_summary`, never fails the run. `ai` schema tables created in `0003_roles.py` (shapes from `ai.md`: `recommendations`, `explanations`, `chat_sessions`), owned by Gajendra for later migrations.
- Tests: hook called once per run; hook 500 -> run still `ok` with error noted; unset `AI_HOOK_URL` -> skipped.
- Deps: T1.14, T2.8. Completeness: 8/10.

### Phase 5: Testing, demo, handover (P5.1-P5.4)

**T5.1 Accuracy verification tool (P5.1)**
- Create: CLI `pb verify sample --n 30 --city both`: random listing rows from the latest run with `url`, store, pincode, MRP, price, availability, stock, `scraped_at` IST, plus the same values read back from `/products` and `/summary`. A person checks the live app within one hour of capture and logs results in `docs/pilot/accuracy-check.md`; discrepancies become issues and are closed or explained.
- Tests: `tests/test_verify.py` (sampling is seeded and repeatable; DB and API values match on a seeded DB).
- Deps: T2.5. Completeness: 8/10.

**T5.2 End-to-end flow test (P5.2)**
- Create: `tests/e2e/test_capture_to_api.py`: fake adapter replays T0.2 fixtures for 2 stores x 3 slots -> runner -> DB -> quality -> API; asserts `/summary`, `/sellout` (`is_estimate`), `/quality/issues`, `/freshness` against hand-computed values. Plus `pb capture run --stores 2 --dry-run` live smoke (manual, before each review).
- CI: a separate GitHub Actions workflow (`.github/workflows/ci.yml`, distinct from `capture.yml`) runs unit/integration/e2e tests on every PR, against a plain `postgres:16` service container — no Timescale dependency, matches Supabase's engine.
- Deps: T1.14, T2.7. Completeness: 9/10.

**T5.3 Demo readiness (P5.3)**
- Create: `docs/pilot/demo-runbook.md`: pre-demo checklist (last 3 runs `ok`, `/quality/issues` reviewed, `/freshness` < 8 h, backup taken), fallback (pause scheduler 2 h before demo so data is stable; known stock-out and rank example picked in advance with their `query_id`s).
- Deps: T5.1, T5.2. Completeness: 7/10.

**T5.4 Outcome report inputs (P5.4)**
- Use T2.11 output for measured volumes vs `capture.yaml`; add `pb report success-measures` that prints each T0.0 measure with its value and pass/fail. Handover: `backend/README.md` (run, deploy, add a city, add a platform adapter), `docs/pilot/scaling-notes.md` (stores x SKUs x slots cost, proxy needs, what broke).
- Tests: report on seeded data matches hand-computed values.
- Deps: T2.11, T0.0. Completeness: 8/10.

### Phase 6: Delivery management (P6.1, P6.2)

**T6.1 Weekly status from data**: `pb report weekly`: runs by status, coverage, open quality issues, rows captured, tasks closed (from this plan's checklist). Pasted into each week's review. Deps: T1.14. Completeness: 7/10.

**T6.2 Open items and risks**: Create `docs/pilot/open-items.md` from the list at the end of this plan (owner, needed-by date, blocking task). Reviewed every Friday. Deps: none. Completeness: 7/10.

### Order and parallelism

```
Week 1: T0.0(H) || T0.1 || T0.2 -> T0.3 || T0.5 -> T0.6
        T1.1 || T1.2 || T1.9 || T2.2 -> T1.3 -> T1.5 || T1.6 -> T1.7 -> T1.8(H); T0.4(H); T6.2
        Milestone: contract frozen, Prism stub + /healthz on shared env, store list + catalogue CSVs
Week 2: T1.10 -> T1.11; T2.3 -> T2.4; T4.1; T1.4 if needed
        Milestone: first real capture in DB, /snapshots /products live, gateway live
Week 3: T1.12 || T2.1 || T2.5 -> T1.13 -> T1.14; T2.6; T2.7; T2.8 -> T4.3; T3.1; T4.2
        Milestone: unattended 3x/day, all data endpoints live, quality checks running
Week 4: T2.9, T2.10, T2.11, T3.2, T5.1, T5.2 -> T5.3, T5.4; T6.1 each week
        Milestone: accuracy reconciled, e2e green, demo, outcome inputs
```

## Data Layer

Supabase Postgres project (hosted, no `timescaledb` extension — D-024); Alembic only. Migrations: `0001_initial`, `0002_rollups`, `0003_roles` (roles + `ai` schema). All reversible; empty tables, no locking concerns. Review with `/bstack:migrate` conventions (it targets Kysely; apply the reversibility and idempotency checks by hand).

| Table | Kind | Key / notes |
|---|---|---|
| `locations` | plain table | PK `pincode`; city, district, delivery_area, lat, lng, serviceable, primary_store_id, first/last_seen_at |
| `stores` | plain table | PK `store_id`; city, store_name, store_address, store_fssai, lat, lng, representative_pincode, eta_minutes, active, first/last_seen_at |
| `pincode_stores` | plain table | PK (`pincode`, `store_id`); role primary/secondary; last_seen_at |
| `products` | plain table | PK `product_id`; name, brand, pack_size, category, category_l1/l2/l3, line, marketer, shelf_life, shelf_life_days, is_drink, is_priority, url, first/last_seen_at |
| `listing_snapshots` | plain table, indexed on `scraped_at` | contract fields + platform, capture_id, run_id, source, absent_reason; unique (run_id, store_id, product_id); index (store_id, product_id, scraped_at desc) for sell-out |
| `search_rank_snapshots` | plain table, indexed on `scraped_at` | run_id, capture_id, city, pincode, store_id, keyword, keyword_type, shown_query, rank, organic_rank, is_sponsored, section, product_id, brand, name, is_paper_boat, is_repeat |
| `raw_responses` | plain table, indexed on `fetched_at` | run_id, store_id, kind, url, payload jsonb; deleted by `pb retention sweep` after 90 d (no compression tier without Timescale) |
| `capture_runs` | plain table | run_id, kind, capture_id, slot, started_at, finished_at, status (running, ok, partial, failed, blocked, skipped_overlap), stores_planned/ok/failed, rows_written, duration_s, error_summary |
| `query_log` | plain table | query_id uuid, endpoint, params jsonb, sql, row_count, created_at |
| `listing_daily` | materialized view | IST day x city x store x product rollups; `REFRESH ... CONCURRENTLY` after each run (T2.1) |
| `ai.recommendations`, `ai.explanations`, `ai.chat_sessions` | plain tables, schema `ai` | Created empty in `0003`; columns per `ai.md`; later migrations by ai-layer |

Sizing: about 200 stores x 15 SKUs x 3 captures x 28 days = 252k listing rows; rank about 200 x 15 keywords x 28 x ~20 cards = 1.7M rows — a few hundred MB. Trivial for plain Postgres on Supabase's free/entry tier; no partitioning needed at POC scale. If the pilot scales to many more stores/cities or a longer retention window, revisit self-hosted TimescaleDB (D-002) for compression and continuous aggregates — noted in `docs/pilot/scaling-notes.md` (T5.4).

## Test Coverage Table

| Behavior | File | Type | Edge cases covered |
|---|---|---|---|
| Settings | `tests/test_settings.py` | unit | missing DATABASE_URL, defaults |
| Config files | `tests/test_config.py` | unit | priority 10-15 ids, sign-off, capture.yaml keys, keywords types |
| OpenAPI stub export | `tests/api/test_openapi_export.py` | unit | every contract route present, examples present, envelope |
| Health | `tests/api/test_health.py` | integration | DB down, no runs yet |
| PDP / search / rank parsers | `tests/adapters/test_blinkit_parsers.py` | unit | available, OOS, not listed, ad flags, related section, repeat, category depth, rupee commas |
| Seed pincodes | `tests/test_seeds.py` | unit | duplicates, prefix vs city |
| Location discovery | `tests/capture/test_locations.py` | integration | idempotent, shared store, unserviceable, store gone |
| Catalogue build | `tests/capture/test_catalogue.py` | integration | PB filter, non-drink, one PDP per product, line parity |
| Exports | `tests/test_exports.py` | integration | headers, empty DB, multi-city |
| Raw + reparse | `tests/capture/test_raw.py` | integration | round trip, idempotent, corrupt line |
| Listing capture | `tests/capture/test_listings.py` | integration | 3 missing-SKU outcomes, stock=0 on OOS, reason with every null |
| Detail copy-forward | same | integration | 23 h vs 25 h, absent on PDP |
| Runner | `tests/capture/test_runner.py` | integration | retry ok, partial, blocked, concurrency cap |
| Slot + lock | `tests/capture/test_schedule.py` | unit + DB | IST boundaries, overlap skipped |
| Metrics | `tests/test_metrics.py` + `fixtures/metrics_cases.json` | unit | restock, drop after restock, OOS ends, gap, MRP null/0, price > MRP |
| API envelope + filters + query log | `tests/api/test_envelope.py` | integration | 422s, totals, query_id resolves |
| Data endpoints | `tests/api/test_*.py` | integration | empty range, not_listed nulls, CSV, `is_estimate` on sell-out |
| Freshness | `tests/api/test_freshness.py` | integration | no runs, one city stale |
| Quality | `tests/test_quality.py` | integration | broken run (429 + 3x price), stale, coverage |
| Roles | `tests/test_roles.py` | integration | readonly cannot write; pb_ai writes only `ai` |
| AI gateway | `tests/api/test_ai_proxy.py` | integration | SSE order, 502, 503, params forwarded |
| AI run hook | `tests/capture/test_ai_hook.py` | integration | once per run, failure non-fatal, unset skipped |
| Parity helper | `tests/parity/test_helper.py` | integration | API value = SQL value |
| Verify sample | `tests/test_verify.py` | integration | seeded sample repeatable; DB = API |
| Capture to API | `tests/e2e/test_capture_to_api.py` | e2e | 2 stores x 3 slots, sell-out, quality, freshness |
| Reports | `tests/test_reports.py` | integration | volumes, success measures, weekly |
| OpenAPI contract | `tests/api/test_openapi_contract.py` | contract | schemathesis all routes; spec diff gate |
| Migrations | `tests/test_migrations.py` | integration | up, down, up |
| Performance | `tests/api/test_perf.py` (slow) | load | 4 weeks of rows, p95 < 500 ms |

Live checks (not in CI): T0.2 spike, T1.12 rank check vs app, T2.10 legacy parity, T5.1 accuracy sample, T2.7 broken run on shared env.

## Auth & Data-Safety Impact

- No user PII collected. Store addresses and FSSAI numbers are public business data on Blinkit product pages.
- Chat messages (`ai.chat_sessions`) may hold whatever users type; keep 30 days, no PII expected (ai.md rule 6).
- API has no auth in the POC; shared env is allow-listed. If the demo host is public, add an API-key header (one dependency in `deps.py`). Decide before P5.3.
- Three DB roles: writer (capture + API), `pb_readonly` (AI ad-hoc SELECT), `pb_ai` (writes `ai` schema only) — created in Supabase the same way as any Postgres role; Supabase's own `anon`/`service_role` keys are **not used** here (this is server-to-server Postgres access, not the Supabase client SDK / PostgREST / RLS path).
- Secrets: `SUPABASE_DB_URL`, `PROXY_URL` live as GitHub Actions encrypted secrets for the capture workflow, and in the API host's own secret manager for the API process; Anthropic key the same way on the ai-layer side. `.env` only for local dev; `.env.example` committed; nothing in the workflow YAML.
- Scraping posture: polite delays, per-store concurrency 1, stop on block, no CAPTCHA bypass. Blinkit terms restrict automated access; commercial use needs legal sign-off (open item).

## Risks

1. **Blinkit blocks us or changes its payloads.**
   Blast radius: capture stops; dashboard and assistant go stale.
   Mitigation: raw kept and re-parseable; parsers isolated with fixture tests; polite pacing; stop on block; optional proxy via env.
   Detection: `capture_runs.status in (blocked, partial)`; `/quality/issues` stale + coverage; `/freshness` pill turns stale.

2. **More dark stores than the 3x/day window can cover.**
   Blast radius: overlapping or skipped runs; sell-out gaps.
   Mitigation: store-level dedupe (D-015), search-first (D-017), concurrency, rank once a day (D-019). Measure seconds per store in T0.2; if a full run exceeds the window, drop to priority stores per city and log the decision.
   Detection: `duration_s` vs window; `skipped_overlap`; T2.11 report.

3. **Frontend or assistant read different numbers than the API.**
   Cause today: `frontend/src/lib/api.ts:20` reads `json.data` as `{snapshots, meta}` (contract says `data` is the list), the frontend computes metrics client-side over every snapshot, and the AI layer could query SQL directly.
   Blast radius: demo shows two different numbers for one question; trust in the pilot is lost.
   Mitigation: settle envelope in T0.4 (one-line frontend change); shared `metrics_cases.json` (T2.2); AI tools call the API (D-022); parity helper (T4.2); `/snapshots` requires a date range.
   Detection: contract test + spec diff (T2.9), parity tests in the golden set, T5.1 accuracy sample.

4. **GitHub Actions scheduling is best-effort, not guaranteed (D-024).**
   Scheduled (`cron:`) workflow runs are known to run late under GitHub-wide load, and GitHub silently **disables a scheduled workflow after 60 days with no commits to the repo**. Runs also execute from GitHub's shared runner IP ranges, which Blinkit may flag or rate-limit sooner than a residential/dedicated IP (compounds Risk 1). A private repo's scheduled runs also draw from the account's Actions minutes quota (2,000 min/month on GitHub Free) — 3 runs/day of a multi-store Playwright crawl can burn through that during a 4-week pilot.
   Blast radius: a slot is missed or arrives late, leaving a sell-out gap for that day; after 60 quiet days the whole schedule silently stops with no error anyone sees until `/freshness` is checked.
   Mitigation: `workflow_dispatch` for manual catch-up (T1.14); `/freshness` endpoint and the data-quality stale-run check (T2.7) surface a missed slot within one capture cycle, not after days; T6.1's weekly report commit keeps the 60-day clock from expiring; minutes usage checked against GitHub's billing page in week 1 and noted in `docs/pilot/scaling-notes.md` — if it's tight, make the repo private->public is not an option (code is proprietary), so move to a self-hosted runner or a small always-on VM calling the same CLI instead (fallback to D-002/D-020).
   Detection: `capture_runs` gap vs the 3x/day expectation (T2.11 report), `/freshness` stale flag, GitHub's own Actions usage/billing page.

## Open items (need a person; tracked in `docs/pilot/open-items.md`, T6.2)

| Item | Owner | Needed by | Blocks |
|---|---|---|---|
| Success measures agreed + review slots booked | PM | W1 day 2 | T0.0 |
| Planning assumption for store count and volume | PM / sheet | W1 day 3 | T1.3, T2.11 |
| Priority product sign-off | Business | End W1 | T1.8, T1.10 priority mode |
| Agreed keyword list (10-20) | Business | W2 | T1.12 |
| Slot times 06:00 / 12:00 / 20:00 IST | PM | W1 | T1.14 |
| AI hosting: separate service + gateway (D-022) | Jeetpal + Gajendra | W1 | T4.1, T4.3 |
| Supabase project created + tier picked (free vs pro, for backup/retention) | Jeetpal | W1 day 1 | T0.3, T0.6 |
| API host (where the FastAPI process runs — Supabase itself only hosts Postgres, not the app) | Jeetpal + PM | W1 day 3 | T0.6 |
| GitHub Actions minutes budget confirmed sufficient for 3x/day over 4 weeks (Risk 4) | Jeetpal | W1 | T1.14 |
| API auth for demo | PM | W3 | T5.3 |
| Legal sign-off on scraping for commercial use | PM | Before P5.3 | Scale-up |
