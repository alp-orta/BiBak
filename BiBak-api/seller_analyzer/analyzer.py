from __future__ import annotations

from typing import Any

from .explain import generate_seller_explanations
from .features import extract_seller_features
from .schemas import SellerAnalysisResult
from .scoring import (
    calculate_seller_context_adjustment,
    calculate_seller_core_score,
    calculate_seller_reliability_score,
    classify_seller_risk,
    generate_seller_flags,
)


def analyze_seller(
    seller_metadata: dict[str, Any] | None = None,
    reviews: list[Any] | None = None,
    review_analysis: dict[str, Any] | None = None,
    pricing_signals: list[dict[str, Any]] | dict[str, Any] | None = None,
    locale: str = "en",
) -> dict[str, Any]:
    features = extract_seller_features(
        seller_metadata=seller_metadata,
        reviews=reviews,
        review_analysis=review_analysis,
        pricing_signals=pricing_signals,
    )
    seller_core_score = calculate_seller_core_score(features)
    seller_context_adjustment = calculate_seller_context_adjustment(features)
    reliability_score = calculate_seller_reliability_score(features)
    seller_flags = generate_seller_flags(features, reliability_score)
    risk_level = classify_seller_risk(reliability_score)
    explanations = generate_seller_explanations(features, seller_flags, locale)

    return SellerAnalysisResult(
        seller_reliability_score=reliability_score,
        seller_core_score=seller_core_score,
        seller_context_adjustment=seller_context_adjustment,
        risk_level=risk_level,
        seller_flags=seller_flags,
        explanations=explanations,
        feature_summary=features.to_dict(),
    ).to_dict()
