from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class ReviewScore:
    index: int
    text_snippet: str
    fraud_score: int
    anomaly_score: float
    cluster_id: int
    flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ClusterInfo:
    cluster_id: int
    size: int
    avg_similarity: float
    sample_texts: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AnalysisResult:
    fraud_score: int
    review_authenticity_score: int
    suspicious_clusters: int
    reasons: list[str]
    cluster_data: list[ClusterInfo]
    review_scores: list[ReviewScore]

    def to_dict(self) -> dict[str, Any]:
        return {
            "fraud_score": self.fraud_score,
            "review_authenticity_score": self.review_authenticity_score,
            "suspicious_clusters": self.suspicious_clusters,
            "reasons": self.reasons,
            "cluster_data": [c.to_dict() for c in self.cluster_data],
            "review_scores": [r.to_dict() for r in self.review_scores],
        }
