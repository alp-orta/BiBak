from __future__ import annotations

import re
from statistics import median
from typing import Any

from services import history_store


PRICE_RE = re.compile(
    r"(?:(?P<prefix>[$€£₺])\s*(?P<prefix_number>\d[\d.,]*)|(?P<suffix_number>\d[\d.,]*)\s*(?P<suffix>TL|TRY|USD|EUR|GBP|₺|[$€£]))",
    re.I,
)
UNIT_PRICE_RE = re.compile(r"^\s*(?:/|per\b|başına\b|adet\b|tablet\b|kapsül\b|kg\b|g\b|gr\b|ml\b|l\b|lt\b|unit\b|piece\b|pcs\b)", re.I)


def clamp(value: float, minimum: int = 0, maximum: int = 100) -> int:
    return max(minimum, min(maximum, int(round(value))))


def _is_unit_price_match(text: str, match: re.Match[str]) -> bool:
    trailing = text[match.end(): match.end() + 32]
    return bool(UNIT_PRICE_RE.search(trailing))


def parse_price_text(price_text: str, parsed_price: dict[str, Any] | None = None) -> dict[str, Any]:
    parsed_price = parsed_price or {}
    text = price_text or ""
    matches = list(PRICE_RE.finditer(text.replace("\xa0", " ")))
    if matches:
        product_price_matches = [match for match in matches if not _is_unit_price_match(text, match)]
        if not product_price_matches:
            return {"value": None, "currency": None, "raw": price_text}
        match = product_price_matches[-1]
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
    price_info = parse_price_text(product.get("price", ""), product.get("parsed_price"))
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
            "explanation": "Fiyat okunamadı." if locale == "tr" else "Price could not be parsed.",
        }

    if history_count < 3:
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
            "warnings": ["insufficient_price_history"],
            "explanation": "Fiyat geçmişi henüz sınırlı; indirim iddiası düşük güvenle değerlendiriliyor." if locale == "tr" else "Price history is still limited, so discount claims are evaluated with low confidence.",
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
    if latest_history_price and abs(current - latest_history_price) / latest_history_price >= 0.1:
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

    explanations = {
        "tr": {
            "normal": "Güncel fiyat gözlenen fiyat geçmişiyle uyumlu.",
            "below_history": "Güncel fiyat geçmiş medyanın belirgin altında; ekrandaki canlı fiyat, Trendyol fiyat geçmişinden daha düşük.",
            "suspicious_discount": "Yakın geçmişte fiyat artışı sonrası normale dönüş var; indirim güveni düşük.",
            "current_price_high": "Güncel fiyat geçmiş medyanın belirgin üzerinde.",
            "not_best_recent_price": "Güncel fiyat gözlenen en düşük fiyatın üzerinde.",
        },
        "en": {
            "normal": "Current price is consistent with observed price history.",
            "below_history": "Current live price is materially below the historical median and lower than Trendyol's stored history.",
            "suspicious_discount": "A recent price spike followed by a return toward normal suggests a weak discount claim.",
            "current_price_high": "Current price is materially above the historical median.",
            "not_best_recent_price": "Current price is above the lowest observed price.",
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
        "explanation": explanations.get(locale, explanations["en"])[risk],
    }


def build_seller_analysis(
    product: dict[str, Any],
    snapshots: list[dict[str, Any]],
    fraud_score: int,
    scrape_confidence: int | None,
    locale: str,
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
            "explanation": "Satıcı bilgisi eksik." if locale == "tr" else "Seller data is missing.",
        }

    all_rows = snapshots + [{
        "product_key": history_store.make_product_key(product),
        "rating": rating,
        "review_count": len(product.get("reviews") or []),
        "fraud_score": fraud_score,
        "scrape_confidence": scrape_confidence,
        "missing_fields": "[]",
    }]
    history_count = len(all_rows)
    product_count = len({row.get("product_key") for row in all_rows if row.get("product_key")})
    ratings = [float(row["rating"]) for row in all_rows if row.get("rating")]
    fraud_scores = [float(row["fraud_score"]) for row in all_rows if row.get("fraud_score") is not None]
    confidences = [float(row["scrape_confidence"]) for row in all_rows if row.get("scrape_confidence") is not None]

    avg_rating = sum(ratings) / len(ratings) if ratings else 0.0
    avg_fraud = sum(fraud_scores) / len(fraud_scores) if fraud_scores else fraud_score
    avg_confidence = sum(confidences) / len(confidences) if confidences else 70.0

    score = 62
    if avg_rating:
        score += (avg_rating - 3.0) * 12
    score += min(product_count, 5) * 4
    score -= avg_fraud * 0.35
    if avg_confidence < 55:
        score -= 8

    warnings: list[str] = []
    if history_count < 3:
        warnings.append("limited_seller_history")
    if avg_fraud >= 45:
        warnings.append("seller_review_risk")
    if avg_confidence < 55:
        warnings.append("low_scrape_confidence")

    if avg_fraud >= 45:
        explanation = "Satıcı geçmişinde yüksek yorum riski görülüyor." if locale == "tr" else "Seller history includes elevated review risk."
    elif history_count < 3:
        explanation = "Satıcı geçmişi sınırlı; puan temkinli hesaplandı." if locale == "tr" else "Seller history is limited, so the score is cautious."
    else:
        explanation = "Satıcı gözlemleri genel olarak tutarlı görünüyor." if locale == "tr" else "Seller observations look broadly consistent."

    return {
        "seller": seller,
        "history_count": history_count,
        "observed_products": product_count,
        "average_rating": round(avg_rating, 2) if avg_rating else None,
        "average_fraud_score": round(avg_fraud, 1),
        "score": clamp(score, 25, 98),
        "confidence": clamp(min(95, 40 + history_count * 10)),
        "warnings": warnings,
        "explanation": explanation,
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
            "buy_now": "Fiyat geçmişe göre makul; satın alma zamanı uygun görünüyor.",
            "below_history": "Canlı fiyat geçmiş medyanın belirgin altında; fiyat açısından uygun bir zaman görünüyor.",
            "wait": "Fiyat sinyalleri zayıf; daha iyi fiyat için beklemek mantıklı.",
            "insufficient_data": "Satın alma zamanı için yeterli fiyat geçmişi yok.",
        },
        "en": {
            "buy_now": "Price looks reasonable against history; timing appears acceptable.",
            "below_history": "Live price is materially below the historical median; timing looks favorable on price.",
            "wait": "Price signals are weak; waiting for a better price is sensible.",
            "insufficient_data": "There is not enough price history for a timing call.",
        },
    }
    reason_key = "below_history" if risk == "below_history" else recommendation
    return {
        "recommendation": recommendation,
        "confidence": confidence,
        "reason": text.get(locale, text["en"])[reason_key],
    }


def _tokens(value: str) -> set[str]:
    return {token for token in re.sub(r"[^\w\s]", " ", value.lower()).split() if len(token) > 2}


def build_safer_alternatives(product: dict[str, Any], trust_score: int, price_score: int) -> list[dict[str, Any]]:
    platform = product.get("platform") or "unknown"
    product_key = history_store.make_product_key(product)
    current_tokens = _tokens(product.get("title") or "")
    if not current_tokens:
        return []

    alternatives: list[dict[str, Any]] = []
    for row in history_store.find_alternative_snapshots(platform, product_key):
        candidate_tokens = _tokens(row.get("title") or "")
        overlap = len(current_tokens & candidate_tokens) / max(len(current_tokens | candidate_tokens), 1)
        if overlap < 0.2:
            continue
        if int(row.get("trust_score") or 0) < max(70, trust_score + 5):
            continue
        alternatives.append({
            "title": row.get("title"),
            "seller": row.get("seller"),
            "url": row.get("url"),
            "price": row.get("price_value"),
            "currency": row.get("currency"),
            "trust_score": row.get("trust_score"),
            "reason": "Higher local trust and price signals",
        })
        if len(alternatives) == 3:
            break

    if price_score < 60:
        return alternatives
    return alternatives[:2]
