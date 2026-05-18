from dataclasses import dataclass, field
from typing import Any


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _coerce_score(value: Any, default: int = 0) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        score = default
    return max(0, min(100, score))


@dataclass
class ProductRequest:
    title: str = ""
    price: str = ""
    seller: str = ""
    reviews: list[str] = field(default_factory=list)
    review_details: list[dict[str, Any]] = field(default_factory=list)
    rating: float = 0.0
    locale: str = "tr"
    platform: str = "unknown"
    product_id: str = ""
    url: str = ""
    scrape_metadata: dict[str, Any] = field(default_factory=dict)
    parsed_price: dict[str, Any] = field(default_factory=dict)
    external_price_history: dict[str, Any] = field(default_factory=dict)
    seller_metadata: dict[str, Any] = field(default_factory=dict)
    pricing_signals: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ProductRequest":
        reviews = payload.get("reviews", [])
        if not isinstance(reviews, list):
            reviews = []

        review_details = payload.get("review_details", [])
        if not isinstance(review_details, list):
            review_details = []
        normalized_review_details = [
            item for item in review_details if isinstance(item, dict)
        ]

        try:
            rating = float(payload.get("rating") or 0.0)
        except (TypeError, ValueError):
            rating = 0.0

        locale = payload.get("locale", "tr")
        if locale not in ("tr", "en"):
            locale = "tr"

        scrape_metadata = payload.get("scrape_metadata", {})
        if not isinstance(scrape_metadata, dict):
            scrape_metadata = {}

        parsed_price = payload.get("parsed_price", {})
        if not isinstance(parsed_price, dict):
            parsed_price = {}

        external_price_history = payload.get("external_price_history", {})
        if not isinstance(external_price_history, dict):
            external_price_history = {}

        seller_metadata = payload.get("seller_metadata", {})
        if not isinstance(seller_metadata, dict):
            seller_metadata = {}

        pricing_signals = payload.get("pricing_signals", [])
        if isinstance(pricing_signals, dict):
            pricing_signals = [pricing_signals]
        if not isinstance(pricing_signals, list):
            pricing_signals = []
        normalized_pricing_signals = [
            item for item in pricing_signals if isinstance(item, dict)
        ]

        platform = _coerce_text(payload.get("platform")).lower() or "unknown"
        if platform not in ("trendyol", "hepsiburada", "amazon", "unknown"):
            platform = "unknown"

        return cls(
            title=_coerce_text(payload.get("title")),
            price=_coerce_text(payload.get("price")),
            seller=_coerce_text(payload.get("seller")),
            reviews=[review.strip() for review in reviews if isinstance(review, str) and review.strip()],
            review_details=normalized_review_details,
            rating=rating,
            locale=locale,
            platform=platform,
            product_id=_coerce_text(payload.get("product_id")),
            url=_coerce_text(payload.get("url")),
            scrape_metadata=scrape_metadata,
            parsed_price=parsed_price,
            external_price_history=external_price_history,
            seller_metadata=seller_metadata,
            pricing_signals=normalized_pricing_signals,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "price": self.price,
            "seller": self.seller,
            "reviews": self.reviews,
            "review_details": self.review_details,
            "rating": self.rating,
            "locale": self.locale,
            "platform": self.platform,
            "product_id": self.product_id,
            "url": self.url,
            "scrape_metadata": self.scrape_metadata,
            "parsed_price": self.parsed_price,
            "external_price_history": self.external_price_history,
            "seller_metadata": self.seller_metadata,
            "pricing_signals": self.pricing_signals,
        }


@dataclass
class AnalysisResponse:
    trust_score: int
    review_authenticity_score: int
    price_integrity_score: int
    seller_reliability_score: int
    risk_flags: list[str]
    explanations: list[str]
    safer_alternatives: list[Any]
    review_analysis: dict[str, Any] | None = None
    price_analysis: dict[str, Any] | None = None
    seller_analysis: dict[str, Any] | None = None
    purchase_timing: dict[str, Any] | None = None
    source: str = "api"
    warnings: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "AnalysisResponse":
        required = (
            "trust_score",
            "review_authenticity_score",
            "price_integrity_score",
            "seller_reliability_score",
            "risk_flags",
            "explanations",
            "safer_alternatives",
        )
        missing = [key for key in required if key not in payload]
        if missing:
            raise ValueError(f"Missing response fields: {', '.join(missing)}")

        return cls(
            trust_score=_coerce_score(payload.get("trust_score")),
            review_authenticity_score=_coerce_score(payload.get("review_authenticity_score")),
            price_integrity_score=_coerce_score(payload.get("price_integrity_score")),
            seller_reliability_score=_coerce_score(payload.get("seller_reliability_score")),
            risk_flags=[str(flag) for flag in payload.get("risk_flags", []) if isinstance(flag, str)],
            explanations=[str(item) for item in payload.get("explanations", []) if isinstance(item, str)],
            safer_alternatives=payload.get("safer_alternatives", [])
            if isinstance(payload.get("safer_alternatives"), list)
            else [],
            review_analysis=payload.get("review_analysis")
            if isinstance(payload.get("review_analysis"), dict)
            else None,
            price_analysis=payload.get("price_analysis")
            if isinstance(payload.get("price_analysis"), dict)
            else None,
            seller_analysis=payload.get("seller_analysis")
            if isinstance(payload.get("seller_analysis"), dict)
            else None,
            purchase_timing=payload.get("purchase_timing")
            if isinstance(payload.get("purchase_timing"), dict)
            else None,
            source=payload.get("source") if payload.get("source") in ("api", "fallback") else "api",
            warnings=[
                str(item) for item in payload.get("warnings", []) if isinstance(item, str)
            ],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "trust_score": self.trust_score,
            "review_authenticity_score": self.review_authenticity_score,
            "price_integrity_score": self.price_integrity_score,
            "seller_reliability_score": self.seller_reliability_score,
            "risk_flags": self.risk_flags,
            "explanations": self.explanations,
            "safer_alternatives": self.safer_alternatives,
            "review_analysis": self.review_analysis,
            "price_analysis": self.price_analysis,
            "seller_analysis": self.seller_analysis,
            "purchase_timing": self.purchase_timing,
            "source": self.source,
            "warnings": self.warnings,
        }
