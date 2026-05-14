import numpy as np
import pandas as pd

from .schemas import ClusterInfo


def generate_explanations(
    clusters: list[ClusterInfo],
    feature_df: pd.DataFrame,
    anomaly_scores: np.ndarray,
    duplicate_density: float,
    labels: np.ndarray,
) -> list[str]:
    reasons: list[str] = []

    total_clustered = int(np.sum(labels != -1))
    if total_clustered > 0:
        reasons.append(
            f"{total_clustered} reviews show near-identical semantic structure"
        )

    for cluster in clusters:
        if cluster.avg_similarity > 0.85:
            reasons.append(
                f"Cluster {cluster.cluster_id} ({cluster.size} reviews) has {cluster.avg_similarity:.0%} "
                f"average semantic similarity — likely coordinated"
            )

    if duplicate_density > 0.3:
        reasons.append(
            f"{duplicate_density:.0%} of reviews fall into duplicate clusters, "
            f"far exceeding normal consumer behavior"
        )

    avg_diversity = feature_df["lexical_diversity"].mean()
    if avg_diversity < 0.55:
        reasons.append(
            f"Average lexical diversity is {avg_diversity:.2f} — unusually low, "
            f"suggesting formulaic or templated writing"
        )

    avg_repeated = feature_df["repeated_word_ratio"].mean()
    if avg_repeated > 0.15:
        reasons.append(
            "Review wording repetition exceeds normal consumer behavior"
        )

    high_anomaly = float(np.mean(anomaly_scores > 0.7))
    if high_anomaly > 0.2:
        reasons.append(
            f"{high_anomaly:.0%} of reviews flagged as statistical outliers "
            f"by anomaly detection"
        )

    avg_excl = feature_df["exclamation_count"].mean()
    if avg_excl > 2.0:
        reasons.append(
            f"Excessive exclamation usage (avg {avg_excl:.1f} per review) "
            f"suggests artificial enthusiasm"
        )

    avg_len = feature_df["text_length"].mean()
    if avg_len < 40:
        reasons.append(
            "Reviews are unusually short on average, consistent with low-effort fake reviews"
        )

    if not reasons:
        reasons.append("No significant fraud signals detected — reviews appear authentic")

    return reasons
