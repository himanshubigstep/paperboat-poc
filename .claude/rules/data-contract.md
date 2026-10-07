# Data contract (PROPOSED — freeze in P0.3)

Source: first real Blinkit test scrape (2026-09-29, 91 rows). Data reaches the frontend and AI layer **only through the backend API** — no data files in this repo.

## Listing record (one row per product × location × capture)
| Field | Type | Notes / sample |
|---|---|---|
| pincode | string | `110005`, `400050` |
| city | string | `New Delhi`, `Mumbai` (UI label: Delhi / Mumbai) |
| store_id | string\|null | `36383` (Delhi), `34679` (Mumbai); null when not listed |
| product_id | string | `306`, `5440` |
| name | string | "Paper Boat Jamun, Fruit Juice …" |
| brand | string\|null | `Paper Boat` |
| pack_size | string\|null | `200 ml`, `2 x 600 ml`, `1.2 ltr` |
| category | string\|null | `Cold Drinks & Juices > Fruit Juice > Fruit Juices` (split on ` > `) |
| mrp | number\|null | ₹ |
| selling_price | number\|null | ₹; discount = (mrp−selling_price)/mrp |
| availability | enum | `available` \| `out_of_stock` \| `not_listed` |
| stock | int | units shown (0 when OOS) |
| shelf_life | string\|null | `8 months`, `180 days` |
| shelf_life_days | int\|null | `242` |
| marketer | string\|null | manufacturer text |
| store_name | string\|null | `BLINK COMMERCE PRIVATE LIMITED` |
| store_address | string\|null | dark-store address |
| url | string | `https://blinkit.com/prn/x/prid/<id>` |
| scraped_at | ISO-8601 UTC | |
| absent_reason | string\|null | **new** — why a field is NULL |
| run_id | string | **new** |

Added in P1.4 (search): `keyword`, `rank`, `is_sponsored` (bool), per keyword × location × capture.

## Planned endpoints (`/api/v1`)
All accept `city`, `store_id|pincode`, `product_id`, `keyword`, `from`, `to`.
- `GET /locations` — stores/pincodes per city
- `GET /products` — product table (pagination, sort, `q`) · `GET /products/export.csv`
- `GET /summary` — KPIs: listings, % available, avg discount, last capture per city
- `GET /availability` — state counts + history · `GET /sellout` — `est_units_sold` series (`is_estimate:true`)
- `GET /price-discount` — price/MRP/discount over time
- `GET /search-rank` — keyword rank, `is_sponsored`
- `GET /cities/compare` — same measures, Delhi vs Mumbai
- `GET /quality/issues` — missing fields, odd prices, stale runs, blocked requests
- `GET /recommendations`, `GET /recommendations/{id}/explanation`, `POST /assistant/chat` (served by `ai-layer`, routed through the backend gateway)
- `GET /query/{query_id}` — the exact query + rows behind any assistant/recommendation figure

Envelope: `{ "data": …, "meta": { "captured_at": "...", "is_estimate": false, "page": 1, "total": 91 } }`.

## Sample-data facts
91 rows · 51 product_ids · 2 pincodes · availability: 72 available, 14 out_of_stock, 5 not_listed · packs: 200–1200 ml, multipacks · categories: fruit juice, mango drinks, coconut water, sparkling drinks, tonic water, soft-drink bottles/cans.
