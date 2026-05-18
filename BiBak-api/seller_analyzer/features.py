from __future__ import annotations

from typing import Any

from .schemas import SellerFeatureSummary


def clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return max(lower, min(upper, value))


def extract_seller_features(
    seller_metadata: dict[str, Any] | None,
    reviews: list[Any] | None = None,
    review_analysis: dict[str, Any] | None = None,
    pricing_signals: list[dict[str, Any]] | dict[str, Any] | None = None,
) -> SellerFeatureSummary:
    seller_metadata = seller_metadata or {}
    badges = _extract_badges(seller_metadata)
    fast_delivery = _coerce_bool(
        seller_metadata.get("fast_delivery_available")
        or seller_metadata.get("fast_delivery")
        or seller_metadata.get("express_delivery")
    ) or _contains_badge(badges, ("hızlı", "hizli", "fast", "express", "tomorrow", "yarın"))
    free_shipping = _coerce_bool(
        seller_metadata.get("free_shipping_available")
        or seller_metadata.get("free_shipping")
    ) or _contains_badge(badges, ("kargo bedava", "free shipping", "ücretsiz kargo"))
    verified_badge = _coerce_bool(
        seller_metadata.get("verified_badge_available")
        or seller_metadata.get("verified_seller")
        or seller_metadata.get("is_verified")
    ) or _contains_badge(badges, ("onaylı", "doğrulanmış", "dogrulanmis", "verified", "resmi", "official"))

    review_authenticity = _review_authenticity_score(review_analysis)
    price_risk = _pricing_context_risk(pricing_signals)

    return SellerFeatureSummary(
        marketplace_seller_score=_coerce_optional_float(
            seller_metadata.get("marketplace_seller_score")
            or seller_metadata.get("seller_score")
            or seller_metadata.get("merchant_score")
        ),
        seller_age_days=_coerce_optional_int(
            seller_metadata.get("seller_age_days")
            or seller_metadata.get("account_age_days")
            or seller_metadata.get("store_age_days")
        ),
        seller_follower_count=_coerce_optional_int(
            seller_metadata.get("seller_follower_count")
            or seller_metadata.get("follower_count")
            or seller_metadata.get("followers")
        ),
        seller_badges=badges,
        verified_badge_available=verified_badge,
        fast_delivery_available=fast_delivery,
        free_shipping_available=free_shipping,
        observed_seller_history_count=_coerce_int(seller_metadata.get("observed_seller_history_count")),
        observed_product_count=_coerce_int(seller_metadata.get("observed_product_count")),
        avg_historical_trust_score=_coerce_optional_float(seller_metadata.get("avg_historical_trust_score")),
        avg_historical_fraud_score=_coerce_optional_float(seller_metadata.get("avg_historical_fraud_score")),
        seller_identity_confidence=_seller_identity_confidence(seller_metadata, badges),
        product_context_risk=max(0.0, min(100.0, (100.0 - review_authenticity) * 0.55 + price_risk * 0.45)),
        review_count=len(reviews or []),
    )


def _extract_badges(seller_metadata: dict[str, Any]) -> list[str]:
    raw_badges = seller_metadata.get("seller_badges") or seller_metadata.get("badges") or []
    if isinstance(raw_badges, str):
        raw_badges = [raw_badges]
    if not isinstance(raw_badges, list):
        return []
    return [str(badge).strip() for badge in raw_badges if str(badge).strip()]


def _contains_badge(badges: list[str], terms: tuple[str, ...]) -> bool:
    badge_text = " ".join(badges).lower()
    return any(term in badge_text for term in terms)


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "evet", "var"}
    return bool(value)


def _coerce_optional_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def _coerce_optional_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(".", "").replace(",", ".")
        multiplier = 1
        lowered = cleaned.lower()
        if lowered.endswith(("k", "b")):
            multiplier = 1_000
            cleaned = cleaned[:-1]
        elif lowered.endswith("m"):
            multiplier = 1_000_000
            cleaned = cleaned[:-1]
        try:
            return int(float(cleaned) * multiplier)
        except ValueError:
            return None
    return None


def _coerce_int(value: Any) -> int:
    coerced = _coerce_optional_int(value)
    return max(0, coerced or 0)


def _seller_identity_confidence(seller_metadata: dict[str, Any], badges: list[str]) -> float:
    confidence = 20.0
    if seller_metadata.get("seller_name") or seller_metadata.get("name"):
        confidence += 20.0
    if _coerce_optional_float(
        seller_metadata.get("marketplace_seller_score")
        or seller_metadata.get("seller_score")
        or seller_metadata.get("merchant_score")
    ) is not None:
        confidence += 25.0
    if seller_metadata.get("store_url"):
        confidence += 15.0
    if badges:
        confidence += 10.0
    if _coerce_bool(
        seller_metadata.get("verified_badge_available")
        or seller_metadata.get("verified_seller")
        or seller_metadata.get("is_verified")
    ) or _contains_badge(badges, ("onaylı", "doğrulanmış", "dogrulanmis", "verified", "resmi", "official")):
        confidence += 10.0
    if _coerce_optional_int(
        seller_metadata.get("seller_follower_count")
        or seller_metadata.get("follower_count")
        or seller_metadata.get("followers")
    ):
        confidence += 10.0
    return clamp(confidence)


def _review_authenticity_score(review_analysis: dict[str, Any] | None) -> float:
    if not isinstance(review_analysis, dict):
        return 100.0
    authenticity = review_analysis.get("review_authenticity_score")
    if isinstance(authenticity, (int, float)):
        return clamp(float(authenticity))
    fraud_score = review_analysis.get("fraud_score")
    if isinstance(fraud_score, (int, float)):
        return clamp(100.0 - float(fraud_score))
    return 100.0


def _pricing_context_risk(pricing_signals: list[dict[str, Any]] | dict[str, Any] | None) -> float:
    if not pricing_signals:
        return 0.0
    rows = pricing_signals if isinstance(pricing_signals, list) else [pricing_signals]
    discounts: list[float] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        direct = row.get("discount_percent") or row.get("discount_percentage")
        if isinstance(direct, (int, float)):
            discounts.append(clamp(float(direct)))
            continue
        original = row.get("original_price") or row.get("list_price")
        sale = row.get("sale_price") or row.get("current_price") or row.get("price")
        if isinstance(original, (int, float)) and isinstance(sale, (int, float)) and original > 0 and sale > 0:
            discounts.append(clamp((float(original) - float(sale)) / float(original) * 100.0))
    if not discounts:
        return 0.0
    return clamp(max(discounts) * 1.2)
