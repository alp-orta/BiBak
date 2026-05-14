import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer

from .schemas import ClusterInfo

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def compute_embeddings(reviews: list[str]) -> np.ndarray:
    model = _get_model()
    return model.encode(reviews, show_progress_bar=False, normalize_embeddings=True)


def compute_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    return cosine_similarity(embeddings)


def detect_clusters(
    embeddings: np.ndarray,
    reviews: list[str],
    eps: float = 0.15,
    min_samples: int = 2,
) -> tuple[list[ClusterInfo], np.ndarray, float]:
    sim_matrix = compute_similarity_matrix(embeddings)
    distance_matrix = 1.0 - sim_matrix
    np.fill_diagonal(distance_matrix, 0.0)
    distance_matrix = np.clip(distance_matrix, 0.0, 2.0)

    dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric="precomputed")
    labels = dbscan.fit_predict(distance_matrix)

    cluster_ids = set(labels)
    cluster_ids.discard(-1)

    clusters: list[ClusterInfo] = []
    for cid in sorted(cluster_ids):
        indices = np.where(labels == cid)[0]
        size = len(indices)
        cluster_sim = sim_matrix[np.ix_(indices, indices)]
        np.fill_diagonal(cluster_sim, 0.0)
        n_pairs = size * (size - 1) if size > 1 else 1
        avg_sim = float(cluster_sim.sum() / n_pairs)
        samples = [reviews[i][:80] for i in indices[:3]]
        clusters.append(
            ClusterInfo(
                cluster_id=int(cid),
                size=size,
                avg_similarity=round(avg_sim, 4),
                sample_texts=samples,
            )
        )

    clustered_count = int(np.sum(labels != -1))
    total = len(reviews)
    duplicate_density = clustered_count / total if total > 0 else 0.0

    return clusters, labels, duplicate_density
