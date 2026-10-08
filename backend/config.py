"""Crawl targets. Add more localities per city to cover more dark stores.

Placeholder only — backend.md's capture job calls for enumerating and
persisting every Blinkit delivery location (store/pincode) in Delhi and
Mumbai, not this fixed list. See README.md.
"""

LOCATIONS = {
    "delhi": [
        {"name": "Karol Bagh", "lat": 28.6519, "lon": 77.1909},
    ],
    "mumbai": [
        {"name": "Bandra West", "lat": 19.0596, "lon": 72.8295},
    ],
}

# Politeness: random pause between page loads (seconds).
PAGE_DELAY = (2.0, 5.0)
# Max scrolls per listing page (each scroll can load another page of products).
MAX_SCROLLS = 25

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
