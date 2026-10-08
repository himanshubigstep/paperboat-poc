import asyncio
import csv
import json
import random
import re
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timezone
from pathlib import Path

from config import MAX_SCROLLS, PAGE_DELAY


@dataclass
class Product:
    platform: str
    city: str
    locality: str
    store_id: str
    product_id: str
    name: str
    brand: str
    pack_size: str
    mrp: float | None
    selling_price: float | None
    in_stock: bool
    available_qty: int | None
    category: str
    url: str
    image: str
    scraped_at: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_rupees(text) -> float | None:
    if text is None:
        return None
    m = re.search(r"[\d,]+(?:\.\d+)?", str(text))
    return float(m.group().replace(",", "")) if m else None


async def polite_pause():
    await asyncio.sleep(random.uniform(*PAGE_DELAY))


async def scroll_until_idle(page, counter, max_scrolls=MAX_SCROLLS):
    """Scroll until `counter()` (e.g. number of captured product responses) stops growing."""
    idle = 0
    # Wheel events go to the element under the cursor; park it over the product grid.
    await page.mouse.move(900, 500)
    for _ in range(max_scrolls):
        before = counter()
        await page.mouse.wheel(0, 5000)
        await page.wait_for_timeout(random.randint(1200, 2000))
        idle = idle + 1 if counter() == before else 0
        if idle >= 3:
            break


class Store:
    """Dedupes products per (platform, store, product) and writes JSONL + CSV."""

    def __init__(self, out_dir="data"):
        self.items: dict[tuple, Product] = {}
        self.out_dir = Path(out_dir)

    def add(self, p: Product):
        self.items[(p.platform, p.store_id, p.product_id)] = p

    def __len__(self):
        return len(self.items)

    def save(self, tag: str) -> Path:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base = self.out_dir / f"{tag}_{stamp}"
        rows = [asdict(p) for p in self.items.values()]
        with open(f"{base}.jsonl", "w") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        with open(f"{base}.csv", "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=[fl.name for fl in fields(Product)])
            w.writeheader()
            w.writerows(rows)
        return base
