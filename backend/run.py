"""Usage:
  python run.py                                  # all cities
  python run.py --city delhi --max-categories 3
"""
import argparse
import asyncio
import logging

from config import LOCATIONS
from crawler import blinkit
from crawler.common import Store


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", choices=[*LOCATIONS, "all"], default="all")
    ap.add_argument("--max-categories", type=int, default=None, help="limit pages per location (for testing)")
    args = ap.parse_args()

    cities = list(LOCATIONS) if args.city == "all" else [args.city]

    for city in cities:
        for loc in LOCATIONS[city]:
            store = Store()
            try:
                await blinkit.crawl(city, loc, store, max_categories=args.max_categories)
            except Exception:
                logging.exception("blinkit %s/%s crashed; saving what we have", city, loc["name"])
            path = store.save(f"blinkit_{city}")
            logging.info("saved %d products -> %s.{jsonl,csv}", len(store), path)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s", datefmt="%H:%M:%S")
    asyncio.run(main())
