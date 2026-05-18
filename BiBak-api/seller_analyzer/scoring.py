from __future__ import annotations

import math

from .schemas import SellerFeatureSummary


def calculate_seller_core_score(features: SellerFeatureSummary) -> int:
    rating_score = _marketplace_rating_score(features.marketplace_seller_score)
    history_score = _history_depth_score(features.observed_seller_history_count)
    age_score = _seller_age_score(features.seller_age_days)
    history_score = history_score * 0.70 + age_score * 0.30
    traction_score = _marketplace_traction_score(features.seller_follower_count)
    fulfillment_score = _fulfillment_score(features)
    identity_score = features.seller_identity_confidence

    core = (
        rating_score * 0.40
        + history_score * 0.20
        + traction_score * 0.15
        + fulfillment_score * 0.15
        + identity_score * 0.10
    )

    if features.avg_historical_trust_score is not None and features.observed_seller_history_count >= 2:
        core = core * 0.85 + features.avg_historical_trust_score * 0.15

    if features.avg_historical_fraud_score is not None and features.observed_seller_history_count >= 2:
        core -= max(0.0, features.avg_historical_fraud_score - 35.0) * 0.10

    return int(round(_clamp(core)))


def calculate_seller_context_adjustment(features: SellerFeatureSummary) -> int:
    return -int(round(_clamp(features.product_context_risk, 0.0, 100.0) * 0.05))


def calculate_seller_reliability_score(features: SellerFeatureSummary) -> int:
    score = calculate_seller_core_score(features) + calculate_seller_context_adjustment(features)
    return int(round(_clamp(score)))


def classify_seller_risk(reliability_score: int) -> str:
    if reliability_score >= 75:
        return "low risk"
    if reliability_score >= 55:
        return "medium risk"
    if reliability_score >= 35:
        return "high risk"
    return "critical risk"


def generate_seller_flags(features: SellerFeatureSummary, reliability_score: int) -> list[str]:
    flags: list[str] = []
    if features.marketplace_seller_score is None:
        flags.append("missing_marketplace_seller_score")
    elif _marketplace_rating_score(features.marketplace_seller_score) < 65:
        flags.append("low_marketplace_seller_score")

    if features.observed_seller_history_count < 3:
        flags.append("limited_BiBak_history")
    if features.seller_age_days is not None and features.seller_age_days < 90:
        flags.append("new_seller")
    if features.seller_identity_confidence < 55:
        flags.append("weak_seller_identity")
    if not features.fast_delivery_available and not features.free_shipping_available:
        flags.append("limited_fulfillment_signals")
    if features.seller_follower_count is None or features.seller_follower_count < 1_000:
        flags.append("limited_marketplace_traction")
    if features.product_context_risk >= 65:
        flags.append("product_context_risk")
    if reliability_score < 35:
        flags.append("seller_trust_critical")
    return flags


def _marketplace_rating_score(raw_score: float | None) -> float:
    if raw_score is None:
        return 55.0
    normalized = raw_score if raw_score > 10 else raw_score * 10.0
    return _clamp(normalized)


def _history_depth_score(history_count: int) -> float:
    if history_count <= 0:
        return 35.0
    if history_count == 1:
        return 50.0
    if history_count == 2:
        return 65.0
    if history_count <= 5:
        return 78.0
    return 90.0


def _seller_age_score(seller_age_days: int | None) -> float:
    if seller_age_days is None:
        return 60.0
    if seller_age_days < 30:
        return 35.0
    if seller_age_days < 90:
        return 50.0
    if seller_age_days < 180:
        return 68.0
    if seller_age_days < 365:
        return 80.0
    return 92.0


def _marketplace_traction_score(follower_count: int | None) -> float:
    if not follower_count or follower_count <= 0:
        return 45.0
    # Log-scale traction avoids making huge shops automatically perfect.
    return _clamp(45.0 + math.log10(follower_count + 1) * 11.0, 45.0, 95.0)


def _fulfillment_score(features: SellerFeatureSummary) -> float:
    score = 45.0
    if features.verified_badge_available:
        score += 10.0
    if features.fast_delivery_available:
        score += 25.0
    if features.free_shipping_available:
        score += 20.0
    if features.seller_badges:
        score += min(10.0, len(features.seller_badges) * 3.0)
    return _clamp(score)


def _clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return max(lower, min(upper, value))
