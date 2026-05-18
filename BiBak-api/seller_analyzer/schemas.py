from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class SellerFeatureSummary:
    marketplace_seller_score: float | None = None
    seller_age_days: int | None = None
    seller_follower_count: int | None = None
    seller_badges: list[str] = field(default_factory=list)
    verified_badge_available: bool = False
    fast_delivery_available: bool = False
    free_shipping_available: bool = False
    observed_seller_history_count: int = 0
    observed_product_count: int = 0
    avg_historical_trust_score: float | None = None
    avg_historical_fraud_score: float | None = None
    seller_identity_confidence: float = 0.0
    product_context_risk: float = 0.0
    review_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        return {key: round(value, 3) if isinstance(value, float) else value for key, value in data.items()}


@dataclass
class SellerAnalysisResult:
    seller_reliability_score: int
    seller_core_score: int
    seller_context_adjustment: int
    risk_level: str
    seller_flags: list[str] = field(default_factory=list)
    explanations: list[str] = field(default_factory=list)
    feature_summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
