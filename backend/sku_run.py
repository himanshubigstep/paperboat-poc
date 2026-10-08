"""Blinkit store + Hector Beverages SKU availability by pincode.

  python sku_run.py --pincodes 110005,400050                      # discover all Paper Boat drinks
  python sku_run.py --pincodes pincodes.csv --skus skus.csv       # specific SKUs (Blinkit product IDs)

CSV inputs need a `pincode` / `product_id` column. Outputs (in data/):
  blinkit_stores_<ts>.csv      pincode, city, delivery area, dark store id + address
  blinkit_hector_sku_<ts>.csv  one row per (pincode, SKU): price, availability, stock, shelf life
"""
import argparse
import asyncio
import csv
import logging
from dataclasses import asdict, fields
from datetime import datetime
from pathlib import Path

from crawler.blinkit_sku import SkuRow, StoreRow, crawl_pincode


def read_list(value: str, column: str) -> list[str]:
    path = Path(value)
    if path.suffix == ".csv" and path.exists():
        with open(path) as f:
            return [row[column].strip() for row in csv.DictReader(f) if row.get(column, "").strip()]
    return [v.strip() for v in value.split(",") if v.strip()]


def write_csv(path: Path, cls, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[fl.name for fl in fields(cls)])
        w.writeheader()
        w.writerows(asdict(r) for r in rows)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pincodes", required=True, help="comma list or CSV file with a `pincode` column")
    ap.add_argument("--skus", help="comma list or CSV file with a `product_id` column; omit to discover Paper Boat drinks")
    args = ap.parse_args()

    pincodes = read_list(args.pincodes, "pincode")
    skus = read_list(args.skus, "product_id") if args.skus else None

    stores, sku_rows = [], []
    for pin in pincodes:
        try:
            store, rows = await crawl_pincode(pin, skus)
            stores.append(store)
            sku_rows.extend(rows)
        except Exception:
            logging.exception("pincode %s failed", pin)

    out = Path("data")
    out.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    write_csv(out / f"blinkit_stores_{stamp}.csv", StoreRow, stores)
    write_csv(out / f"blinkit_hector_sku_{stamp}.csv", SkuRow, sku_rows)
    logging.info("saved %d stores, %d sku rows -> data/blinkit_{stores,hector_sku}_%s.csv", len(stores), len(sku_rows), stamp)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s", datefmt="%H:%M:%S")
    asyncio.run(main())
