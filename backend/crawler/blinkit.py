"""Blinkit: location comes from gr_1_lat/gr_1_lon cookies; products arrive as JSON from
POST /v1/layout/listing_widgets as the listing page scrolls. We let the browser make those
calls and parse the responses."""

import logging
from urllib.parse import urlparse

from playwright.async_api import async_playwright

from config import USER_AGENT
from crawler.common import Product, Store, now_iso, parse_rupees, polite_pause, scroll_until_idle

log = logging.getLogger("blinkit")
BASE = "https://blinkit.com"


def _text(v) -> str:
    return (v or {}).get("text", "") if isinstance(v, dict) else (v or "")


def parse_listing(payload: dict, city: str, locality: str, category: str) -> list[Product]:
    out = []
    for snip in (payload.get("response") or {}).get("snippets", []):
        if "product_card" not in (snip.get("widget_type") or ""):
            continue
        d = snip.get("data") or {}
        pid = d.get("product_id") or (d.get("identity") or {}).get("id")
        if not pid:
            continue
        price = parse_rupees(_text(d.get("normal_price")))
        out.append(Product(
            platform="blinkit",
            city=city,
            locality=locality,
            store_id=str(d.get("merchant_id", "")),
            product_id=str(pid),
            name=_text(d.get("display_name")) or _text(d.get("name")),
            brand=_text(d.get("brand_name")),
            pack_size=_text(d.get("variant")),
            mrp=parse_rupees(_text(d.get("mrp"))) or price,
            selling_price=price,
            in_stock=not d.get("is_sold_out", False),
            available_qty=d.get("inventory"),
            category=category,
            url=f"{BASE}/prn/x/prid/{pid}",
            image=(d.get("image") or {}).get("url", ""),
            scraped_at=now_iso(),
        ))
    return out


def _category_name(href: str) -> str:
    parts = [p for p in urlparse(href).path.split("/") if p]
    return "/".join(parts[1:3]) if len(parts) > 1 else href


async def crawl(city: str, loc: dict, store: Store, max_categories: int | None = None, headless=True):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        ctx = await browser.new_context(user_agent=USER_AGENT, locale="en-IN", viewport={"width": 1400, "height": 900})
        await ctx.add_cookies([
            {"name": n, "value": str(v), "domain": "blinkit.com", "path": "/"}
            for n, v in [("gr_1_lat", loc["lat"]), ("gr_1_lon", loc["lon"]), ("gr_1_locality", loc["name"])]
        ])
        page = await ctx.new_page()

        current = {"category": "", "responses": 0}

        async def on_response(resp):
            if "/v1/layout/listing_widgets" not in resp.url or resp.status != 200:
                return
            try:
                payload = await resp.json()
            except Exception:
                return
            current["responses"] += 1
            for prod in parse_listing(payload, city, loc["name"], current["category"]):
                store.add(prod)

        page.on("response", on_response)

        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        hrefs = await page.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))")
        cats = sorted({h for h in hrefs if h and (h.startswith("/dc/") or h.startswith("/cn/")) and "e-cards" not in h})
        log.info("%s/%s: %d categories", city, loc["name"], len(cats))

        for i, href in enumerate(cats[:max_categories]):
            current["category"] = _category_name(href)
            before = len(store)
            try:
                await page.goto(BASE + href, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(3000)
                await scroll_until_idle(page, lambda: current["responses"])
            except Exception as e:
                log.warning("failed %s: %s", href, e)
            log.info("[%d/%d] %s +%d products (total %d)", i + 1, len(cats), current["category"], len(store) - before, len(store))
            await polite_pause()

        await browser.close()
