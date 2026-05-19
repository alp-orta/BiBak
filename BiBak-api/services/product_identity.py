import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse, urlunparse


SUPPORTED_PLATFORMS = {"trendyol", "hepsiburada", "amazon", "unknown"}


@dataclass(frozen=True)
class ProductIdentity:
    platform: str
    product_key: str
    product_id: str | None
    canonical_url: str | None
    listing_id: str | None
    seller_id: str | None
    variant_id: str | None
    category: str | None

    def to_dict(self) -> dict[str, str | None]:
        return {
            "platform": self.platform,
            "product_key": self.product_key,
            "product_id": self.product_id,
            "canonical_url": self.canonical_url,
            "listing_id": self.listing_id,
            "seller_id": self.seller_id,
            "variant_id": self.variant_id,
            "category": self.category,
        }


def _text(value: Any) -> str:
    return str(value or "").strip()


def _platform(value: Any) -> str:
    platform = _text(value).lower()
    return platform if platform in SUPPORTED_PLATFORMS else "unknown"


def _first_text(*values: Any) -> str | None:
    for value in values:
        text = _text(value)
        if text:
            return text
    return None


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _url(value: Any):
    text = _text(value)
    if not text:
        return None
    try:
        parsed = urlparse(text)
    except ValueError:
        return None
    if not parsed.netloc:
        return None
    return parsed


def _canonical_url(value: Any, platform: str, product_id: str | None = None) -> str | None:
    parsed = _url(value)
    if not parsed:
        return None

    scheme = parsed.scheme or "https"
    host = parsed.netloc.lower()
    path = re.sub(r"/+", "/", parsed.path).rstrip("/")
    if not path:
        path = "/"

    if platform == "amazon" and product_id:
        return f"{scheme}://{host}/dp/{product_id.upper()}"

    if platform == "trendyol" and product_id:
        match = re.search(r"^(.+?-p-)\d+", path, flags=re.I)
        if match:
            return f"{scheme}://{host}{match.group(1)}{product_id}"

    if platform == "hepsiburada" and product_id:
        match = re.search(r"^(.+?-p-)[A-Za-z0-9]+", path, flags=re.I)
        if match:
            return f"{scheme}://{host}{match.group(1)}{product_id}"

    return urlunparse((scheme, host, path, "", "", ""))


def _product_id_from_url(url: Any, platform: str) -> str | None:
    parsed = _url(url)
    if not parsed:
        return None
    path = parsed.path
    if platform == "trendyol":
        return _match(path, r"-p-(\d+)")
    if platform == "hepsiburada":
        return _match(path, r"-p-([A-Za-z0-9]+)")
    if platform == "amazon":
        asin = _match(path, r"/(?:dp|gp/product|product-reviews|gp/aw/d)/([A-Z0-9]{10})(?:[/?#]|$)")
        return asin.upper() if asin else None
    return None


def _match(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text, flags=re.I)
    return match.group(1) if match else None


def _seller_id_from_url(value: Any, platform: str) -> str | None:
    parsed = _url(value)
    if not parsed:
        return None

    query = parse_qs(parsed.query)
    for key in ("seller", "merchant", "merchantId", "sellerId"):
        if query.get(key):
            return _text(query[key][0]) or None

    if platform == "trendyol":
        return _match(parsed.path, r"-m-(\d+)")
    if platform == "hepsiburada":
        return _match(parsed.path, r"/magaza/[^/]+/([A-Za-z0-9_-]+)")
    if platform == "amazon":
        return _match(parsed.path, r"/sp\?seller=([A-Z0-9]+)")
    return None


def _category(payload: dict[str, Any], url: Any) -> str | None:
    metadata = _dict(payload.get("scrape_metadata"))
    seller_metadata = _dict(payload.get("seller_metadata"))
    explicit = _first_text(
        payload.get("category"),
        payload.get("category_id"),
        payload.get("categoryId"),
        metadata.get("category"),
        metadata.get("categoryId"),
        seller_metadata.get("category"),
    )
    if explicit:
        return explicit

    return None


def _listing_id(payload: dict[str, Any]) -> str | None:
    metadata = _dict(payload.get("scrape_metadata"))
    diagnostics = _dict(metadata.get("diagnostics"))
    external = _dict(payload.get("external_price_history"))
    return _first_text(
        payload.get("listing_id"),
        payload.get("listingId"),
        metadata.get("listingId"),
        diagnostics.get("selectedListingId"),
        external.get("listingId"),
    )


def _seller_id(payload: dict[str, Any], platform: str) -> str | None:
    seller_metadata = _dict(payload.get("seller_metadata"))
    seller_snapshot = _dict(payload.get("seller_snapshot"))
    return _first_text(
        payload.get("seller_id"),
        payload.get("sellerId"),
        seller_snapshot.get("seller_id"),
        seller_snapshot.get("sellerId"),
        seller_metadata.get("seller_id"),
        seller_metadata.get("sellerId"),
        seller_metadata.get("id"),
        _seller_id_from_url(seller_metadata.get("store_url"), platform),
    )


def _variant_id(payload: dict[str, Any], listing_id: str | None) -> str | None:
    metadata = _dict(payload.get("scrape_metadata"))
    diagnostics = _dict(metadata.get("diagnostics"))
    external = _dict(payload.get("external_price_history"))
    return _first_text(
        payload.get("variant_id"),
        payload.get("variantId"),
        metadata.get("variantId"),
        diagnostics.get("variantId"),
        external.get("variantId"),
        listing_id,
    )


def resolve_product_identity(payload: dict[str, Any]) -> ProductIdentity:
    platform = _platform(payload.get("platform"))
    metadata = _dict(payload.get("scrape_metadata"))
    external = _dict(payload.get("external_price_history"))
    url = _first_text(payload.get("url"), metadata.get("url"))

    product_id = _first_text(
        payload.get("product_id"),
        payload.get("productId"),
        metadata.get("productId"),
        metadata.get("contentId"),
        external.get("contentId"),
        _product_id_from_url(url, platform),
    )
    if platform == "amazon" and product_id:
        product_id = product_id.upper()

    listing_id = _listing_id(payload)
    canonical_url = _canonical_url(url, platform, product_id)
    seller_id = _seller_id(payload, platform)
    variant_id = _variant_id(payload, listing_id)
    category = _category(payload, url)

    explicit_key = _first_text(payload.get("product_key"), payload.get("productKey"))
    if explicit_key:
        product_key = explicit_key
    elif product_id:
        product_key = f"{platform}:product:{product_id}"
    elif canonical_url:
        product_key = f"{platform}:url:{canonical_url}"
    else:
        title = " ".join(_text(payload.get("title")).lower().split())
        seller = " ".join(_text(payload.get("seller") or payload.get("seller_name")).lower().split())
        product_key = f"{platform}:fallback:{title or 'unknown-product'}:{seller}"

    return ProductIdentity(
        platform=platform,
        product_key=product_key,
        product_id=product_id,
        canonical_url=canonical_url,
        listing_id=listing_id,
        seller_id=seller_id,
        variant_id=variant_id,
        category=category,
    )
