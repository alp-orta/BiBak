from __future__ import annotations

import re
import ssl
import time
from statistics import median
from typing import Any
from urllib.request import Request, urlopen

from seller_analyzer import analyze_seller
from services import history_store


PRICE_RE = re.compile(
    r"(?:(?P<prefix>[$€£₺])\s*(?P<prefix_number>\d[\d.,]*)|(?P<suffix_number>\d[\d.,]*)\s*(?P<suffix>TL|TRY|USD|EUR|GBP|₺|[$€£]))",
    re.I,
)
UNIT_PRICE_RE = re.compile(r"^\s*(?:/|per\b|başına\b|adet\b|tablet\b|kapsül\b|kg\b|g\b|gr\b|ml\b|l\b|lt\b|unit\b|piece\b|pcs\b)", re.I)
TRENDYOL_DATALAYER_PRICE_RE = re.compile(r'"product_price"\s*:\s*(\d+(?:\.\d+)?)')
TRENDYOL_PRICE_CACHE_TTL_SECONDS = 300
TRENDYOL_DATALAYER_OVERRIDE_THRESHOLD = 0.12
_TRENDYOL_PRICE_CACHE: dict[str, tuple[float, float]] = {}


def clamp(value: float, minimum: int = 0, maximum: int = 100) -> int:
    return max(minimum, min(maximum, int(round(value))))


def _is_unit_price_match(text: str, match: re.Match[str]) -> bool:
    trailing = text[match.end(): match.end() + 32]
    return bool(UNIT_PRICE_RE.search(trailing))


def _is_basket_price_match(text: str, matches: list[re.Match[str]], index: int) -> bool:
    match = matches[index]
    previous_end = matches[index - 1].end() if index > 0 else max(0, match.start() - 48)
    context = text[previous_end:match.start()].lower()
    return "sepette" in context


def parse_price_text(price_text: str, parsed_price: dict[str, Any] | None = None) -> dict[str, Any]:
    parsed_price = parsed_price or {}
    text = price_text or ""
    matches = list(PRICE_RE.finditer(text.replace("\xa0", " ")))
    if matches:
        product_price_matches = [
            (index, match)
            for index, match in enumerate(matches)
            if not _is_unit_price_match(text, match)
        ]
        if not product_price_matches:
            return {"value": None, "currency": None, "raw": price_text}
        basket_price_matches = [
            match
            for index, match in product_price_matches
            if _is_basket_price_match(text, matches, index)
        ]
        match = basket_price_matches[0] if basket_price_matches else [match for _, match in product_price_matches][-1]
        number = match.group("prefix_number") or match.group("suffix_number") or ""
        if "," in number and "." in number:
            normalized = number.replace(".", "").replace(",", ".")
        elif "," in number:
            normalized = number.replace(".", "").replace(",", ".")
        else:
            parts = number.split(".")
            normalized = "".join(parts) if len(parts) > 1 and len(parts[-1]) == 3 else number

        try:
            amount = float(normalized)
        except ValueError:
            amount = None

        marker = (match.group("prefix") or match.group("suffix") or "").upper()
        currency_map = {"₺": "TRY", "TL": "TRY", "TRY": "TRY", "$": "USD", "USD": "USD", "€": "EUR", "EUR": "EUR", "£": "GBP", "GBP": "GBP"}
        return {"value": amount, "currency": currency_map.get(marker, "TRY") if amount else None, "raw": price_text}

    value = parsed_price.get("value")
    currency = parsed_price.get("currency")
    if isinstance(value, (int, float)) and value > 0:
        return {"value": float(value), "currency": str(currency or "TRY").upper(), "raw": price_text}

    return {"value": None, "currency": None, "raw": price_text}


def _fetch_trendyol_datalayer_price(url: str) -> float | None:
    if not url or "trendyol.com" not in url or "-p-" not in url:
        return None

    cache_key = url.split("?")[0]
    cached = _TRENDYOL_PRICE_CACHE.get(cache_key)
    now = time.time()
    if cached and now - cached[0] < TRENDYOL_PRICE_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        request = Request(
            cache_key,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
            },
        )
        with urlopen(request, timeout=2.5, context=ssl._create_unverified_context()) as response:
            html = response.read(750_000).decode("utf-8", errors="ignore")
    except Exception:
        return None

    match = TRENDYOL_DATALAYER_PRICE_RE.search(html)
    if not match:
        return None

    try:
        price = float(match.group(1))
    except ValueError:
        return None

    if price > 0:
        _TRENDYOL_PRICE_CACHE[cache_key] = (now, price)
        return price
    return None


def resolve_current_price(product: dict[str, Any]) -> dict[str, Any]:
    price_info = parse_price_text(product.get("price", ""), product.get("parsed_price"))
    if product.get("platform") != "trendyol":
        return price_info

    datalayer_price = _fetch_trendyol_datalayer_price(str(product.get("url") or ""))
    current = price_info.get("value")
    if datalayer_price is None:
        return price_info

    if not isinstance(current, (int, float)):
        should_override = True
    else:
        current_price = float(current)
        relative_difference = abs(current_price - datalayer_price) / datalayer_price
        should_override = (
            relative_difference >= TRENDYOL_DATALAYER_OVERRIDE_THRESHOLD
            and datalayer_price < current_price
        )

    if should_override:
        return {
            "value": datalayer_price,
            "currency": "TRY",
            "raw": product.get("price", ""),
            "source": "trendyol_datalayer",
            "overrode_value": current,
        }

    return price_info


def _price_values(snapshots: list[dict[str, Any]], currency: str | None) -> list[float]:
    return [
        float(row["price_value"])
        for row in snapshots
        if row.get("price_value") is not None and (not currency or row.get("currency") == currency)
    ]


def _external_price_values(product: dict[str, Any]) -> tuple[list[float], str | None, float | None]:
    external = product.get("external_price_history") or {}
    prices = external.get("prices") if isinstance(external, dict) else None
    if not isinstance(prices, dict):
        return [], None, None

    entries = [
        (str(date), float(value))
        for date, value in prices.items()
        if isinstance(value, (int, float)) and value > 0
    ]
    entries.sort(key=lambda item: item[0])
    values = [value for _, value in entries]
    source = external.get("source") if isinstance(external.get("source"), str) else "external"
    latest = entries[-1][1] if entries else None
    return values, source, latest


def build_price_analysis(product: dict[str, Any], snapshots: list[dict[str, Any]], locale: str) -> dict[str, Any]:
    price_info = resolve_current_price(product)
    current = price_info["value"]
    currency = price_info["currency"]
    external_values, history_source, latest_history_price = _external_price_values(product)
    values = external_values or _price_values(snapshots, currency)
    history_source = history_source or "local_snapshots"
    history_count = len(values)
    analysis_values = [*values, current] if current is not None else values

    if current is None:
        avg = sum(values) / len(values) if values else None
        return {
            "current_price": None,
            "currency": currency,
            "history_count": history_count,
            "observed_low": min(analysis_values) if analysis_values else None,
            "observed_median": median(values) if values else None,
            "observed_average": round(avg, 2) if avg is not None else None,
            "observed_high": max(analysis_values) if analysis_values else None,
            "discount_risk": "unknown",
            "confidence": 0,
            "score": 65,
            "source": history_source,
            "warnings": ["missing_price"],
            "current_price_source": price_info.get("source") or "scraped_page",
            "explanation": "Fiyat okunamadı." if locale == "tr" else "Price could not be read.",
        }

    if history_count < 3:
        warnings = ["insufficient_price_history"]
        if price_info.get("source") == "trendyol_datalayer":
            warnings.append("scraped_price_overridden_by_trendyol_datalayer")
        avg = sum(values) / len(values) if values else current
        return {
            "current_price": current,
            "currency": currency,
            "history_count": history_count,
            "observed_low": min(analysis_values) if analysis_values else current,
            "observed_median": median(values) if values else current,
            "observed_average": round(avg, 2) if avg is not None else None,
            "observed_high": max(analysis_values) if analysis_values else current,
            "discount_risk": "insufficient_history",
            "confidence": min(55, (30 if external_values else 15) + history_count * 10),
            "score": 82,
            "source": history_source,
            "warnings": warnings,
            "current_price_source": price_info.get("source") or "scraped_page",
            "overrode_current_price": price_info.get("overrode_value"),
            "explanation": "Fiyat geçmişi az. İndirim gerçek mi emin değiliz." if locale == "tr" else "There is little price history, so the discount is not certain.",
        }

    low = min(analysis_values)
    med = median(values)
    avg = sum(values) / len(values)
    high = max(analysis_values)
    current_vs_median = current / med if med else 1.0
    current_vs_average = current / avg if avg else 1.0
    recent = values[-5:]
    recent_high = max(recent) if recent else high
    prior_spike = recent_high >= med * 1.25 and current <= med * 1.05

    score = 92
    risk = "normal"
    warnings: list[str] = []
    if price_info.get("source") == "trendyol_datalayer":
        warnings.append("scraped_price_overridden_by_trendyol_datalayer")
    live_history_mismatch = bool(latest_history_price and abs(current - latest_history_price) / latest_history_price >= 0.1)
    if live_history_mismatch:
        warnings.append("live_price_differs_from_history")

    if current_vs_median <= 0.85:
        score = 98
        risk = "below_history"
    elif prior_spike:
        score = 48
        risk = "suspicious_discount"
        warnings.append("suspicious_discount_pattern")
    elif current_vs_median >= 1.2:
        score = 58
        risk = "current_price_high"
        warnings.append("current_price_above_history")
    elif current > low * 1.15:
        score = 76
        risk = "not_best_recent_price"
        warnings.append("not_lowest_observed_price")

    mismatch_suffix = {
        "tr": " Geçmiş verisi farklı satıcı/listing'e ait olabilir.",
        "en": " The history may belong to a different listing or seller.",
    }
    explanations = {
        "tr": {
            "normal": "Fiyat normal görünüyor.",
            "below_history": "Fiyat geçmişe göre düşük görünüyor.",
            "suspicious_discount": "Fiyat önce artmış, sonra düşmüş olabilir. İndirime dikkat edin.",
            "current_price_high": "Fiyat geçmişe göre yüksek görünüyor.",
            "not_best_recent_price": "Bu fiyat gördüğümüz en düşük fiyat değil.",
        },
        "en": {
            "normal": "The price looks normal.",
            "below_history": "The price looks low compared with past prices.",
            "suspicious_discount": "The price may have gone up and then down. Check the discount.",
            "current_price_high": "The price looks high compared with past prices.",
            "not_best_recent_price": "This is not the lowest price we saw.",
        },
    }

    return {
        "current_price": current,
        "currency": currency,
        "history_count": history_count,
        "observed_low": low,
        "observed_median": med,
        "observed_average": round(avg, 2),
        "observed_high": high,
        "latest_history_price": latest_history_price,
        "current_vs_median": round(current_vs_median, 3),
        "current_vs_average": round(current_vs_average, 3),
        "discount_risk": risk,
        "confidence": min(98 if external_values else 95, (70 if external_values else 55) + history_count * 4),
        "score": score,
        "source": history_source,
        "warnings": warnings,
        "current_price_source": price_info.get("source") or "scraped_page",
        "overrode_current_price": price_info.get("overrode_value"),
        "explanation": explanations.get(locale, explanations["en"])[risk] + (mismatch_suffix.get(locale, mismatch_suffix["en"]) if live_history_mismatch else ""),
    }


def build_seller_analysis(
    product: dict[str, Any],
    snapshots: list[dict[str, Any]],
    fraud_score: int,
    scrape_confidence: int | None,
    locale: str,
    review_analysis: dict[str, Any] | None = None,
    pricing_signals: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    seller = product.get("seller") or ""
    rating = float(product.get("rating") or 0.0)
    if not seller or seller == "N/A":
        return {
            "seller": seller or None,
            "history_count": 0,
            "observed_products": 0,
            "score": 50,
            "confidence": 0,
            "warnings": ["missing_seller"],
            "explanation": "Satıcı bilgisi eksik." if locale == "tr" else "Seller info is missing.",
        }

    current_review_count = len(product.get("reviews") or [])
    all_rows = snapshots + [{
        "product_key": history_store.make_product_key(product),
        "rating": rating,
        "review_count": current_review_count,
        "fraud_score": fraud_score,
        "scrape_confidence": scrape_confidence,
        "missing_fields": "[]",
    }]
    history_count = len(all_rows)
    product_count = len({row.get("product_key") for row in all_rows if row.get("product_key")})
    fraud_scores = [float(row["fraud_score"]) for row in all_rows if row.get("fraud_score") is not None]
    trust_scores = [float(row["trust_score"]) for row in all_rows if row.get("trust_score") is not None]
    confidences = [float(row["scrape_confidence"]) for row in all_rows if row.get("scrape_confidence") is not None]

    avg_fraud = sum(fraud_scores) / len(fraud_scores) if fraud_scores else fraud_score
    avg_confidence = sum(confidences) / len(confidences) if confidences else 70.0

    if history_count < 3:
        explanation = "Satıcı hakkında az bilgi var. Bu yüzden puan kesin değil." if locale == "tr" else "There is little seller info, so the score is not final."
    else:
        explanation = "Satıcı normal görünüyor." if locale == "tr" else "The seller looks normal."

    seller_metadata = dict(product.get("seller_metadata") or {})
    seller_metadata.setdefault("name", seller)
    seller_metadata.setdefault("seller_name", seller)
    seller_metadata["observed_seller_history_count"] = history_count
    seller_metadata["observed_product_count"] = product_count
    if trust_scores:
        seller_metadata["avg_historical_trust_score"] = sum(trust_scores) / len(trust_scores)
    if fraud_scores:
        seller_metadata["avg_historical_fraud_score"] = avg_fraud
    if "seller_age_days" not in seller_metadata and "account_age_days" not in seller_metadata:
        first_seen = min((row.get("created_at") for row in all_rows if row.get("created_at")), default=None)
        if first_seen:
            seller_metadata["first_seen"] = first_seen

    seller_intelligence = analyze_seller(
        seller_metadata=seller_metadata,
        review_analysis=review_analysis or {
            "fraud_score": fraud_score,
            "review_authenticity_score": max(0, min(100, 100 - fraud_score)),
            "cluster_data": [],
        },
        pricing_signals=pricing_signals or product.get("pricing_signals") or [],
        locale=locale,
    )
    seller_flags = seller_intelligence["seller_flags"]
    warnings: list[str] = []
    if history_count < 3:
        warnings.append("limited_seller_history")
    if avg_confidence < 55:
        warnings.append("low_scrape_confidence")
    warnings.extend(seller_flags)

    confidence = clamp(min(95, 40 + history_count * 10))

    return {
        "seller": seller,
        "history_count": history_count,
        "observed_products": product_count,
        "average_fraud_score": round(avg_fraud, 1),
        "score": seller_intelligence["seller_reliability_score"],
        "seller_core_score": seller_intelligence["seller_core_score"],
        "seller_context_adjustment": seller_intelligence["seller_context_adjustment"],
        "risk_level": seller_intelligence["risk_level"],
        "seller_flags": seller_flags,
        "feature_summary": seller_intelligence["feature_summary"],
        "confidence": confidence,
        "warnings": list(dict.fromkeys(warnings)),
        "explanation": explanation,
        "explanations": seller_intelligence["explanations"],
    }


def build_purchase_timing(price_analysis: dict[str, Any], locale: str) -> dict[str, Any]:
    risk = price_analysis.get("discount_risk")
    confidence = int(price_analysis.get("confidence") or 0)
    if risk == "insufficient_history" or confidence < 50:
        recommendation = "insufficient_data"
    elif risk in ("suspicious_discount", "current_price_high"):
        recommendation = "wait"
    else:
        recommendation = "buy_now"

    text = {
        "tr": {
            "buy_now": "Fiyat makul görünüyor.",
            "below_history": "Fiyat geçmişe göre iyi görünüyor.",
            "wait": "Daha iyi fiyat için beklemek mantıklı olabilir.",
            "insufficient_data": "Fiyat için yeterli geçmiş bilgi yok.",
        },
        "en": {
            "buy_now": "The price looks okay.",
            "below_history": "The price looks good compared with past prices.",
            "wait": "Waiting may get you a better price.",
            "insufficient_data": "There is not enough old price info.",
        },
    }
    reason_key = "below_history" if risk == "below_history" else recommendation
    return {
        "recommendation": recommendation,
        "confidence": confidence,
        "reason": text.get(locale, text["en"])[reason_key],
    }

