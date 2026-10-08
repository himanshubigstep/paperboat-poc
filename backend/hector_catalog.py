"""Hector Beverages product catalogue from hectorbeverages.com, with a search keyword per product.

  python hector_catalog.py          # -> data/hector_products_<ts>.csv

The site has no product API: each brand page lists its categories as <h4> tiles and keeps the
products in JS template strings (one template per category, in tile order) that fill a popup.
"""
import csv
import html
import re
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

BASE = "https://www.hectorbeverages.com"

# Sub-brand/flavour words the site leaves out of the product title, keyed by (page, category).
BRAND_PREFIX = {
    ("pb-drinks", "Fruit Juices"): "Paper Boat Swing",
}


# Site titles that are too vague to search on (the category noun or fruit is only in the copy).
KEYWORD_OVERRIDE = {
    ("Vitamin D drinks", "Orange"): "Paper Boat Orange Vit D",
    ("Vitamin D drinks", "Alphonso"): "Paper Boat Alphonso Mango Juice",
    ("Mixed Nuts", "Roasted with Wayanad Pepper"): "Paper Boat Cashew Almond Wayanad Pepper",
    ("Mixed Nuts", "Smoked with Himalayan Pink Salt"): "Paper Boat Smoked Cashew Almond Himalayan Pink Salt",
    ("Cashews", "Garlic and Onion"): "Paper Boat Onion Garlic Cashews",
    ("Almonds", "Roasted Wayanad Himalayan Pink Salt"): "Paper Boat Smoked Almonds Himalayan Pink Salt",
    ("Trail Mixes", "Absolute Health"): "Paper Boat Absolute Health Super Mix",
    ("Trail Mixes", "Protein Crunch"): "Paper Boat Protein Crunch Mix",
}


# What a shopper types without a brand name: generic, Hinglish/regional and common misspellings.
# Keyed by product title as scraped (lowercase); "*<category>" entries apply to the whole category.
GENERIC_KEYWORDS = {
    "aamras": ("mango drink | mango pulp drink | aam ras | mango juice", "aam ka ras | aamrus", "amras | aamrass"),
    "chilli guava": ("guava juice | spicy guava drink | guava drink", "amrood juice | mirchi amrood", "chili guava | guava chilly"),
    "jaljeera": ("jaljeera drink | cumin drink | digestive drink", "jal jeera | jaljira", "jal jira | jaljeeraa"),
    "aam panna": ("raw mango drink | kairi drink | summer cooler", "aam pana | kairi panha | panha", "aampanna | aam pannaa"),
    "santra": ("orange juice | orange drink", "santra juice | narangi juice", "santara | santre"),
    "coconut water": ("coconut water | tender coconut water | electrolyte drink", "nariyal pani | nariyal paani | elaneer", "cocunut water | coconat water"),
    "lychee nata de coco": ("lychee drink with coconut jelly | nata de coco | jelly drink", "litchi drink", "litchi nata | nata de coco drink"),
    "orange nata de coco": ("orange drink with coconut jelly | nata de coco | jelly drink", "santra jelly drink", "nata di coco"),
    "pomegranate with sabja seeds": ("pomegranate drink with basil seeds | chia seed drink | sabja drink", "anar sabja | tukmaria drink", "sabja seed drink | sabza"),
    "mixed fruit with sabja seeds": ("mixed fruit drink with basil seeds | sabja drink", "tukmaria drink", "sabza drink"),
    "apple vit d": ("apple juice | vitamin d juice | kids juice", "seb juice", "aple juice"),
    "mixed fruit vit d": ("mixed fruit juice | vitamin d juice | kids juice", "", "mix fruit juice"),
    "lychee vit d": ("lychee juice | vitamin d juice", "litchi juice", "lichi juice | lichee juice"),
    "orange": ("orange juice | orange drink | vitamin d juice", "santra juice", "orenge juice"),
    "alphonso": ("alphonso mango juice | mango juice | mango drink", "hapus mango juice | aam juice", "alphanso mango | alfonso mango"),
    "anar low sugar": ("pomegranate juice | low sugar juice | sugar free juice | diabetic juice", "anar juice | anar ras", "pomegranet juice"),
    "jamun low sugar": ("jamun juice | black plum juice | low sugar juice | diabetic juice", "jamun ras", "jamoon juice | jambu juice"),
    "thandai": ("thandai | holi drink | badam milk | flavoured milk", "thandai drink", "thandaai | tandai"),
    "mixed fruit": ("mixed fruit juice | fruit drink", "", "mix fruit drink"),
    "pomegranate": ("pomegranate juice | pomegranate drink", "anar juice", "pomegranet juice"),
    "lychee": ("lychee juice | lychee drink", "litchi juice", "lichi drink"),
    "mango": ("mango juice | mango drink | mango frooti", "aam juice", "mengo juice"),
    "guava": ("guava juice | guava drink", "amrood juice", "guva juice"),
    "*Sparkling Water": ("sparkling water | flavoured sparkling water | zero sugar drink | zero calorie drink | fizzy water | carbonated water", "soda water", "sparkeling water | sparklin water"),
    "tonic water": ("tonic water | mixer | cocktail mixer", "", "tonik water"),
    "club soda": ("club soda | soda water | mixer | carbonated water", "soda", "clube soda"),
    "mint mojito": ("mojito | mint mojito mixer | virgin mojito", "pudina soda", "mohito | mojitto"),
    "jeera soda": ("jeera soda | cumin soda | masala soda | desi soda", "jeera masala soda | goli soda", "jira soda | zeera soda"),
    "absolute health": ("trail mix | healthy snack | seeds mix | superfood mix", "", "trial mix"),
    "protein crunch": ("protein snack | nut mix | chickpea nut mix | healthy snack", "", "protien crunch"),
    "panchmeva": ("dry fruit mix | mixed dry fruits | fasting snack", "panchmewa | panch meva | vrat dry fruits", "panchmev"),
    "roasted with wayanad pepper": ("pepper cashew almond | roasted mixed nuts | black pepper nuts", "kali mirch kaju badam", "peper cashew"),
    "smoked with himalayan pink salt": ("smoked nuts | pink salt nuts | roasted mixed nuts", "sendha namak kaju badam", "himalyan salt nuts"),
    "garlic and onion": ("garlic cashew | onion garlic cashew | flavoured cashew", "lehsun kaju | lasun kaju", "garlik cashew"),
    "ratlami cashews": ("spicy cashew | masala cashew | flavoured cashew", "ratlami kaju | masala kaju", "ratlami kaaju"),
    "classic salted cashews": ("salted cashew | roasted cashew | cashew nuts", "namkeen kaju | kala namak kaju", "cashue | cashw"),
    "whole cashews": ("cashew | cashew nuts | whole cashew | w320 cashew", "kaju | kaaju", "cashue | kaju w240"),
    "roasted wayanad himalayan pink salt": ("almonds | roasted almonds | salted almonds | smoked almonds", "badam | roasted badam", "almond | almands | badaam"),
    "california pistachios -roasted and salted": ("pistachios | salted pistachio | roasted pistachio", "pista | salted pista", "pistachio | pistachos | pista nuts"),
    "peanut chikki": ("peanut chikki | peanut bar | jaggery peanut bar | chikki", "moongfali chikki | gur chikki | shengdana chikki", "chiki | chikky"),
    "crushed peanut chikki": ("crushed peanut chikki | peanut brittle | chikki", "gur moongfali chikki", "chiki | chikky"),
    "dry fruit chikki": ("dry fruit chikki | dry fruit bar | jaggery bar | chikki", "gur dry fruit chikki", "dryfruit chiki"),
    "sesame chikki": ("sesame chikki | sesame bar | til chikki", "til patti | til gajak | gajak | til gud", "sesami chikki | til chiki"),
    "aam papad": ("aam papad | mango bar | mango leather | mango candy", "amba poli | aam papdi | aam paapad", "am papad | aampapad"),
}
KEYWORD_TYPES = ("generic", "hinglish_regional", "misspelling")


def generic_rows(products: list[dict]) -> list[dict]:
    rows, seen = [], set()
    for p in products:
        spec = GENERIC_KEYWORDS.get(p["product"].lower()) or GENERIC_KEYWORDS.get("*" + p["category"])
        if not spec:
            continue
        for kind, words in zip(KEYWORD_TYPES, spec):
            for kw in filter(None, (w.strip() for w in words.split("|"))):
                key = (p["brand"], p["product"], kw)
                if key not in seen:
                    seen.add(key)
                    rows.append(dict(search_keyword=kw, keyword_type=kind, brand=p["brand"],
                                     category=p["category"], product=p["product"],
                                     brand_keyword=p["search_keyword"]))
    return rows


def fetch(path: str) -> str:
    req = Request(BASE + path, headers={"User-Agent": "Mozilla/5.0"})
    return urlopen(req, timeout=30).read().decode("utf-8", "replace")


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def strip_svg(page: str) -> str:
    return re.sub(r"<svg.*?</svg>", "", page, flags=re.S)


def popup_templates(page: str) -> list[str]:
    """Backtick template strings in the page script that contain product <h3> titles."""
    script = max(re.findall(r"<script[^>]*>(.*?)</script>", page, flags=re.S), key=len)
    return [t for t in re.findall(r"`(.*?)`", script, flags=re.S) if "<h3" in t]


def tile_popup_products(slug: str, brand: str, section_re: str) -> list[dict]:
    page = strip_svg(fetch(f"/{slug}"))
    categories = [clean(c) for c in re.findall(r"<h4[^>]*>(.*?)</h4>", page.split("available on")[0], flags=re.S)]
    rows = []
    for i, tpl in enumerate(popup_templates(page)):
        category = categories[i] if i < len(categories) else ""
        for block in re.split(r"(?=<h3)", tpl)[1:]:
            name = clean(re.search(r"<h3[^>]*>(.*?)</h3>", block, flags=re.S).group(1))
            name = name[0].upper() + name[1:]
            desc = clean(re.sub(r"<h3.*?</h3>", "", block, flags=re.S))
            rows.append(dict(brand=BRAND_PREFIX.get((slug, category), brand), section=section_re,
                             category=category, product=name, pack_sizes="", description=desc[:300],
                             source_url=f"{BASE}/{slug}"))
    return rows


def zero_products() -> list[dict]:
    page = strip_svg(fetch("/zero"))
    body = page.split("give us a follow")[0]
    flavours = body.split(">flavours<")[1].split(">sparkling mixers<")[0]
    mixers = body.split(">sparkling mixers<")[1]
    rows = []
    for category, chunk, suffix in (("Sparkling Water", flavours, " Sparkling Water"), ("Sparkling Mixers", mixers, "")):
        for name in re.findall(r"<h4[^>]*>(.*?)</h4>", chunk, flags=re.S):
            rows.append(dict(brand="Paper Boat Zero", section="Drinks", category=category,
                             product=clean(name).title() + suffix, pack_sizes="", description="",
                             source_url=f"{BASE}/zero"))
    return rows


def jeera_products() -> list[dict]:
    page = fetch("/jeera")
    sizes = sorted(set(re.findall(r"\b(\d+\s?ml)\b", page, flags=re.I)), key=lambda s: int(re.sub(r"\D", "", s)))
    return [dict(brand="Swing", section="Drinks", category="Jeera Soda", product="Jeera Soda",
                 pack_sizes=" | ".join(sizes), description="Classic jeera soda", source_url=f"{BASE}/jeera")]


def search_keywords(row: dict) -> tuple[str, str]:
    """(primary keyword, alternates) for searching the product on Blinkit/Zepto/Instamart."""
    brand, name = row["brand"], row["product"]
    base = re.sub(r"\s*-\s*", " ", name)
    primary = KEYWORD_OVERRIDE.get((row["category"], name)) or (
        base if base.lower().startswith(brand.lower()) else f"{brand} {base}")
    alts = {f"Paper Boat {base}", base}
    if row["category"] == "Jeera Soda":
        alts |= {"Swing Jeera Soda", "Paper Boat Jeera Soda", "Jeera Soda"}
    return primary, " | ".join(sorted(a for a in alts if a.lower() != primary.lower()))


def main():
    rows = (tile_popup_products("pb-drinks", "Paper Boat", "Drinks")
            + zero_products() + jeera_products()
            + tile_popup_products("dry-fruit-and-nuts", "Paper Boat", "Dry Fruits & Nuts"))

    # A product can appear in two tiles (e.g. Coconut Water); keep the first.
    seen, unique = set(), []
    for r in rows:
        key = (r["brand"], r["product"].lower())
        if key not in seen:
            seen.add(key)
            r["search_keyword"], r["alt_keywords"] = search_keywords(r)
            unique.append(r)

    out = Path("data")
    out.mkdir(exist_ok=True)
    stamp = f"{datetime.now():%Y%m%d_%H%M%S}"

    path = out / f"hector_products_{stamp}.csv"
    cols = ["brand", "section", "category", "product", "search_keyword", "alt_keywords", "pack_sizes", "description", "source_url"]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(unique)
    print(f"saved {len(unique)} products -> {path}")

    missing = [p["product"] for p in unique if not (GENERIC_KEYWORDS.get(p["product"].lower()) or GENERIC_KEYWORDS.get("*" + p["category"]))]
    if missing:
        print("no generic keywords for (add them to GENERIC_KEYWORDS):", ", ".join(missing))
    generic = generic_rows(unique)
    path = out / f"hector_generic_keywords_{stamp}.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["search_keyword", "keyword_type", "brand", "category", "product", "brand_keyword"])
        w.writeheader()
        w.writerows(generic)
    print(f"saved {len(generic)} generic keywords ({len({g['search_keyword'] for g in generic})} unique) -> {path}")


if __name__ == "__main__":
    main()
