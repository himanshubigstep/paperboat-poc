"""Blinkit search rank of Paper Boat products for each keyword, across pincodes.

  python rank_run.py --pincodes pincodes.csv                                   # all generic keywords
  python rank_run.py --pincodes 110005 --keywords "mango juice,coconut water"  # quick test
  python rank_run.py --pincodes pincodes.csv --keywords data/hector_generic_keywords_<ts>.csv --max-rank 30

--keywords takes a comma list or a CSV with a `search_keyword` column (default: the newest
data/hector_generic_keywords_*.csv from hector_catalog.py). Outputs in data/, written as the crawl goes:
  blinkit_rank_summary_<ts>.csv  one row per (pincode, keyword): best Paper Boat rank, # in top 5/10/20, share
  blinkit_rank_pb_<ts>.csv       one row per Paper Boat card found: rank, organic rank, ad, price, stock
  blinkit_rank_serp_<ts>.csv     every card (all brands) in the top --max-rank, for competitor analysis
  blinkit_rank_stores_<ts>.csv   pincode -> dark store
"""
import argparse
import asyncio
import csv
import logging
from dataclasses import asdict, fields
from datetime import datetime
from pathlib import Path

from crawler.blinkit_rank import KeywordSummaryRow, SerpRow, crawl_pincode_ranks
from crawler.blinkit_sku import StoreRow
from sku_run import read_list


def read_keywords(value: str | None) -> list[tuple[str, str]]:
    if not value:
        files = sorted(Path("data").glob("hector_generic_keywords_*.csv"))
        if not files:
            raise SystemExit("no data/hector_generic_keywords_*.csv; run hector_catalog.py or pass --keywords")
        value = str(files[-1])
        logging.info("keywords from %s", value)
    path = Path(value)
    pairs = []
    if path.suffix == ".csv" and path.exists():
        with open(path) as f:
            pairs = [(r["search_keyword"].strip(), r.get("keyword_type", "")) for r in csv.DictReader(f) if r.get("search_keyword", "").strip()]
    else:
        pairs = [(k.strip(), "custom") for k in value.split(",") if k.strip()]
    seen, unique = set(), []
    for kw, kind in pairs:  # the generic file repeats a keyword once per product it maps to
        if kw.lower() not in seen:
            seen.add(kw.lower())
            unique.append((kw, kind))
    return unique


class CsvSink:
    def __init__(self, path: Path, cls):
        self.f = open(path, "w", newline="")
        self.w = csv.DictWriter(self.f, fieldnames=[fl.name for fl in fields(cls)])
        self.w.writeheader()

    def write(self, rows):
        self.w.writerows(asdict(r) for r in rows)
        self.f.flush()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pincodes", required=True, help="comma list or CSV file with a `pincode` column")
    ap.add_argument("--keywords", help="comma list or CSV with a `search_keyword` column")
    ap.add_argument("--max-rank", type=int, default=50, help="how many result cards to read per keyword (default 50)")
    ap.add_argument("--show-browser", action="store_true")
    args = ap.parse_args()

    pincodes = read_list(args.pincodes, "pincode")
    keywords = read_keywords(args.keywords)
    logging.info("%d pincodes x %d keywords = %d searches", len(pincodes), len(keywords), len(pincodes) * len(keywords))

    out = Path("data")
    out.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    summary = CsvSink(out / f"blinkit_rank_summary_{stamp}.csv", KeywordSummaryRow)
    pb = CsvSink(out / f"blinkit_rank_pb_{stamp}.csv", SerpRow)
    serp = CsvSink(out / f"blinkit_rank_serp_{stamp}.csv", SerpRow)
    stores = CsvSink(out / f"blinkit_rank_stores_{stamp}.csv", StoreRow)

    def on_keyword(s, rows):
        summary.write([s])
        serp.write(rows)
        pb.write([r for r in rows if r.is_paper_boat])

    for pin in pincodes:
        try:
            stores.write([await crawl_pincode_ranks(pin, keywords, args.max_rank, on_keyword, headless=not args.show_browser)])
        except Exception:
            logging.exception("pincode %s failed", pin)
    logging.info("done -> data/blinkit_rank_{summary,pb,serp,stores}_%s.csv", stamp)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s", datefmt="%H:%M:%S")
    asyncio.run(main())
