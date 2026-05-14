import numpy as np

from .features import extract_features_batch
from .clustering import compute_embeddings, detect_clusters
from .anomaly import detect_anomalies
from .explain import generate_explanations
from .schemas import AnalysisResult, ReviewScore


def _compute_fraud_scores(
    anomaly_scores: np.ndarray,
    labels: np.ndarray,
    duplicate_density: float,
    feature_df,
) -> np.ndarray:
    text_lengths = feature_df["text_length"].values
    word_lengths = feature_df["average_word_length"].values
    diversity_vals = feature_df["lexical_diversity"].values
    repetition_vals = feature_df["repeated_word_ratio"].values
    exclamation_vals = feature_df["exclamation_count"].values

    length_adjustment = np.clip((text_lengths - 35.0) / 110.0, 0.25, 1.0)

    anomaly_component = anomaly_scores * 24.0
    cluster_component = np.where(labels != -1, 8.0 + duplicate_density * 18.0, 0.0)
    diversity_penalty = np.clip((0.52 - diversity_vals) / 0.52, 0.0, 1.0) * 16.0 * length_adjustment
    repetition_penalty = np.clip((repetition_vals - 0.16) / 0.22, 0.0, 1.0) * 14.0 * length_adjustment
    exclamation_penalty = np.clip((exclamation_vals - 2.0) / 5.0, 0.0, 1.0) * 6.0
    short_vague_penalty = np.where(text_lengths < 45, 4.0, 0.0)
    atypical_wording_penalty = np.where((word_lengths > 8.5) | (word_lengths < 3.0), 4.0, 0.0)

    scores = (
        anomaly_component
        + cluster_component
        + diversity_penalty
        + repetition_penalty
        + exclamation_penalty
        + short_vague_penalty
        + atypical_wording_penalty
    )
    scores = np.clip(scores, 0, 100).astype(int)
    return scores


def _compute_global_fraud_score(per_review_fraud: np.ndarray, duplicate_density: float) -> int:
    mean_fraud = float(np.mean(per_review_fraud))
    high_risk_ratio = float(np.mean(per_review_fraud >= 60))
    moderate_risk_ratio = float(np.mean(per_review_fraud >= 40))

    global_fraud = (
        mean_fraud * 0.55
        + high_risk_ratio * 100.0 * 0.15
        + moderate_risk_ratio * 100.0 * 0.10
        + duplicate_density * 100.0 * 0.50
    )
    return int(np.clip(round(max(mean_fraud * 0.7, global_fraud)), 0, 100))


def analyze_reviews(reviews: list[str]) -> dict:
    if not reviews:
        return AnalysisResult(
            fraud_score=0,
            review_authenticity_score=100,
            suspicious_clusters=0,
            reasons=["No reviews provided"],
            cluster_data=[],
            review_scores=[],
        ).to_dict()

    feature_df = extract_features_batch(reviews)

    embeddings = compute_embeddings(reviews)

    clusters, labels, duplicate_density = detect_clusters(embeddings, reviews)

    anomaly_scores = detect_anomalies(feature_df)

    per_review_fraud = _compute_fraud_scores(
        anomaly_scores, labels, duplicate_density, feature_df
    )

    reasons = generate_explanations(
        clusters, feature_df, anomaly_scores, duplicate_density, labels
    )

    review_score_objects: list[ReviewScore] = []
    for i, text in enumerate(reviews):
        flags: list[str] = []
        if labels[i] != -1:
            flags.append(f"semantic_cluster_{labels[i]}")
        if anomaly_scores[i] > 0.7:
            flags.append("statistical_outlier")
        if feature_df.iloc[i]["text_length"] >= 80 and feature_df.iloc[i]["lexical_diversity"] < 0.42:
            flags.append("low_lexical_diversity")
        if feature_df.iloc[i]["text_length"] >= 80 and feature_df.iloc[i]["repeated_word_ratio"] > 0.22:
            flags.append("high_word_repetition")

        review_score_objects.append(
            ReviewScore(
                index=i,
                text_snippet=text[:100],
                fraud_score=int(per_review_fraud[i]),
                anomaly_score=round(float(anomaly_scores[i]), 4),
                cluster_id=int(labels[i]),
                flags=flags,
            )
        )

    global_fraud = _compute_global_fraud_score(per_review_fraud, duplicate_density)
    global_authenticity = max(0, 100 - global_fraud)

    return AnalysisResult(
        fraud_score=global_fraud,
        review_authenticity_score=global_authenticity,
        suspicious_clusters=len(clusters),
        reasons=reasons,
        cluster_data=clusters,
        review_scores=review_score_objects,
    ).to_dict()
