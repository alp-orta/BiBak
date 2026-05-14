import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


def detect_anomalies(
    feature_df: pd.DataFrame,
    contamination: float = 0.15,
    random_state: int = 42,
) -> np.ndarray:
    scaler = StandardScaler()
    scaled = scaler.fit_transform(feature_df.values)

    iso = IsolationForest(
        contamination=contamination,
        random_state=random_state,
        n_estimators=200,
    )
    iso.fit(scaled)

    raw_scores = iso.decision_function(scaled)
    normalized = (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-9)
    anomaly_scores = 1.0 - normalized
    return anomaly_scores
