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
    rating: float = 0.0
    locale: str = "tr"

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ProductRequest":
        reviews = payload.get("reviews", [])
        if not isinstance(reviews, list):
            reviews = []

        try:
            rating = float(payload.get("rating") or 0.0)
        except (TypeError, ValueError):
            rating = 0.0

        locale = payload.get("locale", "tr")
        if locale not in ("tr", "en"):
            locale = "tr"

        return cls(
            title=_coerce_text(payload.get("title")),
            price=_coerce_text(payload.get("price")),
            seller=_coerce_text(payload.get("seller")),
            reviews=[review.strip() for review in reviews if isinstance(review, str) and review.strip()],
            rating=rating,
            locale=locale,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "price": self.price,
            "seller": self.seller,
            "reviews": self.reviews,
            "rating": self.rating,
            "locale": self.locale,
        }


@dataclass
class AnalysisResponse:
    trust_score: int
    review_authenticity_score: int
    price_integrity_score: int
    seller_reliability_score: int
    risk_flags: list[str]
    explanations: list[str]
    safer_alternatives: list[str]
    review_analysis: dict[str, Any] | None = None
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
            safer_alternatives=[
                str(item) for item in payload.get("safer_alternatives", []) if isinstance(item, str)
            ],
            review_analysis=payload.get("review_analysis")
            if isinstance(payload.get("review_analysis"), dict)
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
            "source": self.source,
            "warnings": self.warnings,
        }
