"""Every Blinkit dark store serving Delhi and Mumbai (P1.1 / plan T1.2-T1.3, lightweight CSV-only pass).

  python locations_run.py                              # all 184 seed pincodes (config/seeds/pincodes.csv)
  python locations_run.py --pincodes 110005,400050      # quick test on a couple

Per pincode: set the location in Blinkit's own location search (same as a shopper), read the
serving dark store(s) from /visibility (store id, lat/lng, ETA), then — once per distinct store,
not once per pincode — load one Paper Boat product page to read the seller name/address/FSSAI
block, the only place Blinkit shows a dark store's street address.

Output (data/, gitignored per D-005):
  blinkit_dark_stores_<ts>.csv  one row per pincode: city, pincode, delivery_area, store_id,
                                store_name, store_address, lat, lng, eta_minutes ("time"),
                                other_store_ids, serviceable, scraped_at
"""
import argparse
import asyncio
import csv
import logging
from dataclasses import asdict, fields
from datetime import datetime
from pathlib import Path

from crawler.blinkit_sku import StoreRow, crawl_pincode_store

SEED_FILE = Path("config/seeds/pincodes.csv")


def read_pincodes(value: str | None) -> list[str]:
    if not value:
        if not SEED_FILE.exists():
            raise SystemExit(f"no {SEED_FILE}; pass --pincodes or regenerate the seed file")
        with open(SEED_FILE) as f:
            return [row["pincode"].strip() for row in csv.DictReader(f) if row.get("pincode", "").strip()]
    path = Path(value)
    if path.suffix == ".csv" and path.exists():
        with open(path) as f:
            return [row["pincode"].strip() for row in csv.DictReader(f) if row.get("pincode", "").strip()]
    return [v.strip() for v in value.split(",") if v.strip()]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pincodes", help="comma list or CSV with a `pincode` column; default: config/seeds/pincodes.csv (184 Delhi+Mumbai pincodes)")
    ap.add_argument("--show-browser", action="store_true")
    args = ap.parse_args()

    pincodes = read_pincodes(args.pincodes)
    logging.info("%d pincodes to check", len(pincodes))

    probe_cache: dict[str, dict] = {}
    stores: list[StoreRow] = []
    for i, pin in enumerate(pincodes, 1):
        try:
            store = await crawl_pincode_store(pin, probe_cache, headless=not args.show_browser)
            stores.append(store)
            logging.info("[%d/%d] %s done (%d distinct stores resolved so far)", i, len(pincodes), pin, len(probe_cache))
        except Exception:
            logging.exception("pincode %s crashed; skipping", pin)

    out = Path("data")
    out.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = out / f"blinkit_dark_stores_{stamp}.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[fl.name for fl in fields(StoreRow)])
        w.writeheader()
        w.writerows(asdict(s) for s in stores)

    unique_stores = {s.store_id for s in stores if s.store_id}
    serviceable = sum(1 for s in stores if s.serviceable)
    logging.info(
        "saved %d pincode rows (%d serviceable, %d distinct dark stores) -> %s",
        len(stores), serviceable, len(unique_stores), path,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    asyncio.run(main())
