"""Blinkit search rank of Paper Boat (Hector Beverages) products for a list of keywords, per pincode.

For each pincode: set the location (same as a user), then for each keyword open the search page and
scroll, recording every result card from POST /v1/layout/search in the order the user sees them.

Per card we keep:
  rank          position among all product cards, ads included (what the shopper sees)
  organic_rank  position among non-sponsored cards only (None for ads)
  is_ad         Blinkit marks sponsored cards with ads_type=monet_product_listing / badge "AD"
  section       "results" (Showing results for "...") or "related" (Showing related products)
"""

import asyncio
import logging
from dataclasses import dataclass
from urllib.parse import quote

from playwright.async_api import async_playwright

from config import USER_AGENT
from crawler.blinkit import BASE, _text
from crawler.blinkit_sku import Session, _store_row
from crawler.common import now_iso, parse_rupees, polite_pause

log = logging.getLogger("blinkit_rank")

HECTOR_BRANDS = ("paper boat",)


@dataclass
class SerpRow:
    """One product card in one keyword's search results."""
    pincode: str
    city: str
    store_id: str
    keyword: str
    keyword_type: str
    shown_query: str         # the query Blinkit says it searched (differs when it auto-corrects)
    rank: int
    organic_rank: int | None
    is_ad: bool
    section: str             # results | related
    product_id: str
    name: str
    brand: str
    pack_size: str
    mrp: float | None
    selling_price: float | None
    in_stock: bool
    is_paper_boat: bool
    is_repeat: bool          # product already shown higher up for this keyword
    scraped_at: str


@dataclass
class KeywordSummaryRow:
    """One row per (pincode, keyword)."""
    pincode: str
    city: str
    store_id: str
    keyword: str
    keyword_type: str
    shown_query: str
    status: str              # ok | no_results | error
    cards_seen: int
    results_section_size: int  # cards before "Showing related products"
    pb_products: int         # distinct Paper Boat products anywhere in the cards seen
    pb_best_rank: int | None
    pb_best_organic_rank: int | None
    pb_best_product: str
    pb_in_top5: int
    pb_in_top10: int
    pb_in_top20: int
    pb_ads: int              # Paper Boat sponsored cards
    top10_share_pct: float | None  # Paper Boat cards / all cards in the top 10
    rank1_brand: str
    rank1_product: str
    scraped_at: str


def is_paper_boat(brand: str, name: str) -> bool:
    return any(brand.strip().lower().startswith(b) or name.strip().lower().startswith(b) for b in HECTOR_BRANDS)


def parse_card(snippet: dict) -> dict:
    d = snippet.get("data") or {}
    item = ((d.get("atc_action") or {}).get("add_to_cart") or {}).get("cart_item") or {}
    common = (snippet.get("tracking") or {}).get("common_attributes") or {}
    click = (snippet.get("tracking") or {}).get("click_map") or {}
    badges = str(((snippet.get("tracking") or {}).get("impression_map") or {}).get("overlay_badges") or "")
    return {
        "product_id": str(d.get("product_id") or item.get("product_id") or ""),
        "name": _text(d.get("name")) or item.get("product_name", ""),
        "brand": item.get("brand") or common.get("brand") or click.get("brand") or "",
        "pack_size": _text(d.get("variant")) or item.get("unit", ""),
        "mrp": parse_rupees(_text(d.get("mrp"))) or item.get("mrp"),
        "price": parse_rupees(_text(d.get("normal_price"))) or item.get("price"),
        "in_stock": not d.get("is_sold_out") and bool(d.get("inventory")),
        "is_ad": common.get("ads_type") == "monet_product_listing" or common.get("badge") == "AD" or "ad," in badges,
    }


class RankSession(Session):
    """Session that also keeps every search snippet in arrival (= on-screen) order."""

    def __init__(self, ctx, page):
        super().__init__(ctx, page)
        self.serp_snippets: list[dict] = []
        page.on("response", self._on_search)

    async def _on_search(self, resp):
        if "/v1/layout/search" not in resp.url or resp.status != 200:
            return
        try:
            data = await resp.json()
        except Exception:
            return
        self.serp_snippets.extend((data.get("response") or {}).get("snippets") or [])

    def product_cards(self) -> int:
        return sum(1 for s in self.serp_snippets if (s.get("data") or {}).get("product_id"))

    async def search(self, keyword: str, max_rank: int) -> list[dict]:
        """Open the search page and scroll until `max_rank` cards are loaded or results end."""
        self.serp_snippets = []
        await self.page.goto(f"{BASE}/s/?q={quote(keyword)}", wait_until="domcontentloaded", timeout=45000)
        for _ in range(20):
            if self.serp_snippets:
                break
            await self.page.wait_for_timeout(500)
        await self.page.mouse.move(900, 500)
        idle = 0
        while self.product_cards() < max_rank and idle < 3:
            before = len(self.serp_snippets)
            await self.page.mouse.wheel(0, 5000)
            await self.page.wait_for_timeout(1500)
            idle = idle + 1 if len(self.serp_snippets) == before else 0
        return list(self.serp_snippets)


def rank_cards(snippets: list[dict], max_rank: int) -> tuple[str, list[dict]]:
    """(shown_query, cards with rank/organic_rank/section) from snippets in on-screen order."""
    shown_query, section, cards, organic, seen = "", "results", [], 0, set()
    for s in snippets:
        d = s.get("data") or {}
        if s.get("widget_type") == "image_text_vr_type_header":
            title = _text(d.get("title"))
            if "related" in title.lower():
                section = "related"
            elif title.lower().startswith("showing results for") and not shown_query:
                shown_query = title.split("for", 1)[1].strip().strip('"“”')
            continue
        if not d.get("product_id"):
            continue  # banners, ad carousels
        c = parse_card(s)
        if not c["is_ad"]:
            organic += 1
        c.update(rank=len(cards) + 1, organic_rank=None if c["is_ad"] else organic, section=section,
                 is_repeat=c["product_id"] in seen)
        seen.add(c["product_id"])
        cards.append(c)
        if len(cards) >= max_rank:
            break
    return shown_query, cards


def summarise(base: dict, shown_query: str, cards: list[dict], status: str) -> KeywordSummaryRow:
    pb = [c for c in cards if c["pb"] and not c["is_repeat"]]
    best = pb[0] if pb else None
    top10 = cards[:10]
    return KeywordSummaryRow(
        **base, shown_query=shown_query, status=status, cards_seen=len(cards),
        results_section_size=sum(1 for c in cards if c["section"] == "results"),
        pb_products=len(pb),
        pb_best_rank=best["rank"] if best else None,
        pb_best_organic_rank=min((c["organic_rank"] for c in pb if c["organic_rank"]), default=None),
        pb_best_product=f'{best["name"]} ({best["pack_size"]})' if best else "",
        pb_in_top5=sum(1 for c in pb if c["rank"] <= 5),
        pb_in_top10=sum(1 for c in pb if c["rank"] <= 10),
        pb_in_top20=sum(1 for c in pb if c["rank"] <= 20),
        pb_ads=sum(1 for c in pb if c["is_ad"]),
        top10_share_pct=round(100 * sum(c["pb"] for c in top10) / len(top10), 1) if top10 else None,
        rank1_brand=cards[0]["brand"] if cards else "",
        rank1_product=cards[0]["name"] if cards else "",
        scraped_at=now_iso(),
    )


async def crawl_pincode_ranks(pincode: str, keywords: list[tuple[str, str]], max_rank: int, on_keyword, headless=True):
    """Search every (keyword, keyword_type) at one pincode. Calls on_keyword(summary, serp_rows) after each
    keyword so long runs are saved as they go. Returns the StoreRow."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        ctx = await browser.new_context(user_agent=USER_AGENT, locale="en-IN", viewport={"width": 1400, "height": 900})
        s = RankSession(ctx, await ctx.new_page())
        await s.set_pincode(pincode)
        store = _store_row(pincode, s)
        log.info("%s -> %s, %s | store %s | serviceable=%s", pincode, store.city, store.delivery_area, store.store_id, store.serviceable)
        if not store.serviceable:
            await browser.close()
            return store

        for i, (kw, kw_type) in enumerate(keywords, 1):
            base = dict(pincode=pincode, city=store.city, store_id=store.store_id, keyword=kw, keyword_type=kw_type)
            snippets = None
            for attempt in range(3):
                try:
                    snippets = await s.search(kw, max_rank)
                    if snippets:
                        break
                except Exception as e:
                    log.warning("%s %r attempt %d: %s", pincode, kw, attempt + 1, str(e).splitlines()[0])
                await asyncio.sleep(10 * (attempt + 1))
            if snippets is None:
                on_keyword(summarise(base, "", [], "error"), [])
                continue

            shown_query, cards = rank_cards(snippets, max_rank)
            for c in cards:
                c["pb"] = is_paper_boat(c["brand"], c["name"])
            serp = [SerpRow(**base, shown_query=shown_query, rank=c["rank"], organic_rank=c["organic_rank"],
                            is_ad=c["is_ad"], section=c["section"], product_id=c["product_id"], name=c["name"],
                            brand=c["brand"], pack_size=c["pack_size"], mrp=c["mrp"], selling_price=c["price"],
                            in_stock=c["in_stock"], is_paper_boat=c["pb"], is_repeat=c["is_repeat"],
                            scraped_at=now_iso()) for c in cards]
            summary = summarise(base, shown_query, cards, "ok" if cards else "no_results")
            on_keyword(summary, serp)
            log.info("  [%d/%d] %-35s best PB rank=%s | PB in top10=%d | cards=%d",
                     i, len(keywords), kw[:35], summary.pb_best_rank, summary.pb_in_top10, len(cards))
            await polite_pause()

        await browser.close()
        return store
