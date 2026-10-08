"""Blinkit store + SKU availability by pincode.

For each pincode: pick it in Blinkit's location search (same as a user), read the delivery
area and serving dark stores, then open each SKU's product page and read the product API
(POST /v1/layout/product/<id>): price, stock, availability, shelf life, marketer, seller.

Blinkit does not publish batch expiry dates; the closest data is Shelf Life / Shelf Life (In days).
"""

import asyncio
import logging
import re
from dataclasses import dataclass

from playwright.async_api import async_playwright

from config import USER_AGENT
from crawler.blinkit import BASE, _text
from crawler.common import now_iso, parse_rupees, polite_pause, scroll_until_idle

log = logging.getLogger("blinkit_sku")

# Hector Beverages sells on Blinkit under the Paper Boat brand: drinks (incl. Swing, Zero,
# Nata De Coco) and snacks (dry fruits, nuts, chikki). D-018: the catalogue covers all of it.
HECTOR_SEARCH_QUERIES = [
    "paper boat", "paper boat swing", "paper boat zero", "paper boat juice",
    "paper boat chikki", "paper boat cashew", "paper boat almonds", "paper boat trail mix",
]
HECTOR_BRANDS = {"paper boat"}
DRINK_UNITS = {"ml", "l", "ltr", "litre", "liter"}


@dataclass
class StoreRow:
    pincode: str
    city: str
    state: str
    delivery_area: str
    serviceable: bool
    store_id: str            # primary ("express") dark store for this pincode
    other_store_ids: str     # longtail / instant stores that also serve it
    store_name: str          # seller entity shown on the product page
    store_address: str       # seller address shown on the product page (the dark store)
    store_fssai: str
    lat: float | None        # from /visibility merchant entry (free, no PDP needed)
    lng: float | None
    eta_minutes: int | None  # "time": delivery ETA in minutes
    scraped_at: str


@dataclass
class SkuRow:
    pincode: str
    city: str
    store_id: str
    product_id: str          # Blinkit SKU id
    name: str
    brand: str
    product_type: str        # Drink | Food (D-018 is_drink flag, human-readable)
    category: str            # full breadcrumb, "L1 > L2 > L3"
    pack_size: str
    mrp: float | None
    selling_price: float | None
    discount_pct: float | None  # offer: (mrp - selling_price) / mrp * 100, None if mrp missing/0
    availability: str        # available | out_of_stock | not_listed | error (page failed to load)
    stock: int | None
    shelf_life: str
    shelf_life_days: int | None
    marketer: str
    store_name: str
    store_address: str
    url: str
    scraped_at: str


def parse_pdp(payload: dict, product_id: str) -> dict:
    """Pull the fields we need out of the product API response."""
    r = payload.get("response") or {}
    seo = ((r.get("tracking") or {}).get("le_meta") or {}).get("custom_data", {}).get("seo") or {}
    attrs = {a.get("name"): a.get("value") for a in seo.get("attributes") or []}
    strip, crumbs = {}, []
    for s in r.get("snippets") or []:
        d = s.get("data") or {}
        if s.get("widget_type") == "product_atc_strip" and str(d.get("product_id")) == str(product_id):
            strip = d
        elif s.get("widget_type") == "horizontal_text_list_snippet" and not crumbs:
            crumbs = [_text(i.get("title")) for i in d.get("horizontal_item_list") or []]
    # "Seller" / "Seller FSSAI" live in the expandable product-details list.
    details = {}
    for s in (((r.get("snippet_list_updater_data") or {}).get("expand_attributes") or {})
              .get("payload") or {}).get("snippets_to_add") or []:
        d = s.get("data") or {}
        details[_text(d.get("title"))] = _text(d.get("subtitle"))
    seller = (details.get("Seller") or "").split("\n", 1)
    days = attrs.get("Shelf Life (In days)")
    return {
        "name": seo.get("product_name", ""),
        "brand": seo.get("brand", ""),
        "pack_size": _text(strip.get("variant")) or attrs.get("Unit", ""),
        "unit_type": (attrs.get("Unit Type") or "").lower(),
        "category": " > ".join(c for c in crumbs if c),
        "mrp": parse_rupees(seo.get("mrp")),
        "price": parse_rupees(_text(strip.get("normal_price"))) or parse_rupees(seo.get("price")),
        "stock": strip.get("inventory", seo.get("inventory")),
        "sold_out": bool(strip.get("is_sold_out")) or strip.get("product_state") not in (None, "available"),
        "has_strip": bool(strip),
        "store_id": str((strip.get("meta") or {}).get("merchant_id", "")),
        "shelf_life": attrs.get("Shelf Life", "") or details.get("Shelf Life", ""),
        "shelf_life_days": int(days) if str(days or "").isdigit() else None,
        "marketer": attrs.get("Marketer’s Name and Address", "") or details.get("Marketer’s Name and Address", ""),
        "store_name": seller[0].strip(),
        "store_address": seller[1].strip().replace("\n", ", ") if len(seller) > 1 else "",
        "store_fssai": details.get("Seller FSSAI", ""),
    }


def is_paper_boat(p: dict) -> bool:
    """True for ANY Paper Boat / Hector Beverages product (D-018: drinks, nuts, chikki — all of it).
    Some listings omit the marketer, so the brand name alone also counts."""
    return "hector" in p["marketer"].lower() or p["brand"].strip().lower() in HECTOR_BRANDS


def is_drink(p: dict) -> bool:
    return p["unit_type"] in DRINK_UNITS or re.search(r"\d\s*(ml|l|ltr)\b", p["pack_size"].lower()) is not None


def is_hector_drink(p: dict) -> bool:
    """Kept for callers that want drinks only (the original, narrower filter)."""
    return is_paper_boat(p) and is_drink(p)


def product_type(p: dict) -> str:
    return "Drink" if is_drink(p) else "Food"


def discount_pct(mrp: float | None, price: float | None) -> float | None:
    if not mrp or price is None:
        return None
    return round((mrp - price) / mrp * 100, 1)


class Session:
    """One browser context located at one pincode, recording the location/store/product APIs."""

    def __init__(self, ctx, page):
        self.ctx, self.page = ctx, page
        self.location_info, self.visibility, self.eta = {}, {}, {}
        self.products: dict[str, dict] = {}   # product_id -> product API payload
        self.search_hits: dict[str, dict] = {}  # product_id -> search card data
        self.search_responses = 0
        page.on("response", self._on_response)

    async def _on_response(self, resp):
        url = resp.url
        if "blinkit.com" not in url or resp.status != 200 or "json" not in resp.headers.get("content-type", ""):
            return
        try:
            data = await resp.json()
        except Exception:
            return
        path = url.split("?")[0].replace(BASE, "")
        if path == "/location/info" and "place_id=" in url:
            self.location_info = data
        elif path == "/visibility":
            self.visibility = data
        elif path == "/v1/consumerweb/eta":
            self.eta = data
        elif path.startswith("/v1/layout/product/"):
            self.products[path.rsplit("/", 1)[-1]] = data
        elif path == "/v1/layout/search":
            self.search_responses += 1
            for s in (data.get("response") or {}).get("snippets") or []:
                d = s.get("data") or {}
                if d.get("product_id"):
                    self.search_hits[str(d["product_id"])] = d

    async def set_pincode(self, pincode: str):
        page = self.page
        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        await page.locator("input[placeholder*='location' i]").first.fill(pincode)
        await page.wait_for_timeout(3000)
        # Prefer the pincode-level suggestion ("<State> <pincode>, India"), else any mentioning it.
        exact = page.get_by_text(re.compile(rf"\b{pincode}, India$"))
        target = exact.first if await exact.count() else page.get_by_text(re.compile(rf"\b{pincode}\b")).nth(1)
        await target.click()
        await page.wait_for_timeout(4000)
        if not self.location_info:
            raise RuntimeError(f"pincode {pincode}: Blinkit location search returned no match")
        # Store list (/visibility) and ETA are only fetched on page load, so reload at the new location.
        self.visibility, self.eta = {}, {}
        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)

    async def discover_hector_skus(self) -> set[str]:
        for q in HECTOR_SEARCH_QUERIES:
            await self.page.goto(f"{BASE}/s/?q={q.replace(' ', '%20')}", wait_until="domcontentloaded")
            await self.page.wait_for_timeout(3000)
            await scroll_until_idle(self.page, lambda: self.search_responses)
            await polite_pause()
        return {
            pid for pid, d in self.search_hits.items()
            if _text(d.get("brand_name")).strip().lower() in HECTOR_BRANDS
        }

    async def fetch_product(self, product_id: str) -> dict | None:
        self.products.pop(product_id, None)
        await self.page.goto(f"{BASE}/prn/x/prid/{product_id}", wait_until="domcontentloaded", timeout=45000)
        for _ in range(20):
            if product_id in self.products:
                return self.products[product_id]
            await self.page.wait_for_timeout(500)
        return None

    async def quick_probe_pid(self) -> str | None:
        """One "paper boat" search, no scroll — just enough to get a single product_id to visit
        for the store's seller name/address/FSSAI. Used once per newly-seen store (location
        discovery only cares about the store, not the catalogue)."""
        await self.page.goto(f"{BASE}/s/?q=paper%20boat", wait_until="domcontentloaded", timeout=45000)
        for _ in range(16):
            hit = next((pid for pid, d in self.search_hits.items()
                        if _text(d.get("brand_name")).strip().lower() in HECTOR_BRANDS), None)
            if hit:
                return hit
            await self.page.wait_for_timeout(500)
        return None


def _store_row(pincode: str, s: Session) -> StoreRow:
    li = s.location_info.get("location_info") or {}
    merchants = s.visibility.get("merchants") or []
    express = next((m for m in merchants if "express" in ((m.get("additional_filters") or {}).get("assortment_tags") or [])),
                   merchants[0] if merchants else {})
    return StoreRow(
        pincode=pincode,
        city=li.get("city") or express.get("city_name", ""),
        state=li.get("state") or express.get("state_name", ""),
        delivery_area=li.get("formatted_address", ""),
        serviceable=bool(s.location_info.get("is_serviceable")) and bool(merchants),
        store_id=str(express.get("id", "")),
        other_store_ids=",".join(str(m["id"]) for m in merchants if m is not express),
        store_name="", store_address="", store_fssai="",
        lat=express.get("lat"), lng=express.get("lng"),
        eta_minutes=s.eta.get("eta_in_minutes"),
        scraped_at=now_iso(),
    )


async def crawl_pincode(pincode: str, skus: list[str] | None, headless=True):
    """Returns (StoreRow, [SkuRow]). skus=None discovers Hector Beverages drinks via search."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        ctx = await browser.new_context(user_agent=USER_AGENT, locale="en-IN", viewport={"width": 1400, "height": 900})
        s = Session(ctx, await ctx.new_page())
        await s.set_pincode(pincode)
        store = _store_row(pincode, s)
        log.info("%s -> %s, %s | store %s | serviceable=%s", pincode, store.city, store.delivery_area, store.store_id, store.serviceable)
        if not store.serviceable:
            await browser.close()
            return store, []

        discovered = skus is None
        if discovered:
            skus = sorted(await s.discover_hector_skus(), key=int)
            log.info("%s: %d Paper Boat SKUs found in search", pincode, len(skus))

        rows = []
        for i, pid in enumerate(skus):
            payload = None
            for attempt in range(3):
                try:
                    payload = await s.fetch_product(pid)
                    if payload is not None:
                        break
                except Exception as e:
                    log.warning("%s sku %s attempt %d: %s", pincode, pid, attempt + 1, str(e).splitlines()[0])
                await asyncio.sleep(10 * (attempt + 1))
            if payload is None:
                # Page never loaded: unknown, not "not listed".
                rows.append(SkuRow(pincode, store.city, "", pid, "", "", "", "", "", None, None, None,
                                   "error", None, "", None, "", "", "", f"{BASE}/prn/x/prid/{pid}", now_iso()))
                continue
            d = parse_pdp(payload, pid)
            if discovered and not is_paper_boat(d):
                log.info("  skip %s (%s): not a Paper Boat / Hector Beverages product", pid, d["name"])
                continue
            availability = "not_listed" if not d["has_strip"] else ("out_of_stock" if d["sold_out"] or not d["stock"] else "available")
            rows.append(SkuRow(
                pincode=pincode, city=store.city, store_id=d["store_id"] or store.store_id, product_id=pid,
                name=d["name"], brand=d["brand"], product_type=product_type(d), category=d["category"],
                pack_size=d["pack_size"], mrp=d["mrp"], selling_price=d["price"],
                discount_pct=discount_pct(d["mrp"], d["price"]), availability=availability,
                stock=d["stock"] if availability == "available" else 0,
                shelf_life=d["shelf_life"], shelf_life_days=d["shelf_life_days"], marketer=d["marketer"],
                store_name=d["store_name"], store_address=d["store_address"],
                url=f"{BASE}/prn/x/prid/{pid}", scraped_at=now_iso(),
            ))
            if not store.store_address and d["store_address"] and d["store_id"] == store.store_id:
                store.store_name, store.store_address, store.store_fssai = d["store_name"], d["store_address"], d["store_fssai"]
            log.info("  [%d/%d] %s %s | %s stock=%s", i + 1, len(skus), pid, d["name"][:50], availability, rows[-1].stock)
            await polite_pause()

        await browser.close()
        return store, rows


async def crawl_pincode_store(pincode: str, probe_cache: dict[str, dict], headless: bool = True) -> StoreRow:
    """Location-only pass (P1.1): pincode -> serving dark store, address, ETA, lat/lng.

    `probe_cache` is store_id -> {store_name, store_address, store_fssai}, shared by the caller
    across pincodes in one run. Many pincodes serve from the same store, so the one-product probe
    (search "paper boat" + load its PDP for the Seller block) only has to run once per store, not
    once per pincode."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        ctx = await browser.new_context(user_agent=USER_AGENT, locale="en-IN", viewport={"width": 1400, "height": 900})
        s = Session(ctx, await ctx.new_page())
        try:
            await s.set_pincode(pincode)
        except Exception as e:
            log.warning("%s: location search failed: %s", pincode, str(e).splitlines()[0])
            await browser.close()
            return StoreRow(pincode, "", "", "", False, "", "", "", "", "", None, None, None, now_iso())

        store = _store_row(pincode, s)
        log.info("%s -> %s, %s | store %s | serviceable=%s", pincode, store.city, store.delivery_area, store.store_id, store.serviceable)

        if store.serviceable and store.store_id and store.store_id not in probe_cache:
            pid = None
            for attempt in range(2):
                try:
                    pid = await s.quick_probe_pid()
                    if pid:
                        break
                except Exception as e:
                    log.warning("%s: probe search attempt %d failed: %s", pincode, attempt + 1, str(e).splitlines()[0])
                await asyncio.sleep(5 * (attempt + 1))
            if pid:
                try:
                    payload = await s.fetch_product(pid)
                    d = parse_pdp(payload, pid) if payload else None
                except Exception as e:
                    d = None
                    log.warning("%s: probe PDP %s failed: %s", pincode, pid, str(e).splitlines()[0])
                if d and d["store_address"]:
                    probe_cache[store.store_id] = {
                        "store_name": d["store_name"], "store_address": d["store_address"], "store_fssai": d["store_fssai"],
                    }
                elif d:
                    probe_cache[store.store_id] = {"store_name": d["store_name"], "store_address": "", "store_fssai": ""}
            else:
                log.info("%s: no Paper Boat product found to probe store %s address", pincode, store.store_id)

        cached = probe_cache.get(store.store_id, {})
        store.store_name = cached.get("store_name", "")
        store.store_address = cached.get("store_address", "")
        store.store_fssai = cached.get("store_fssai", "")

        await browser.close()
        await polite_pause()
        return store
