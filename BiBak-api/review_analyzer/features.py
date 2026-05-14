import re
import string
import numpy as np
import pandas as pd


TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall((text or "").lower())


def text_length(text: str) -> int:
    return len(text)


def punctuation_density(text: str) -> float:
    if not text:
        return 0.0
    punct_count = sum(1 for c in text if c in string.punctuation)
    return punct_count / len(text)


def uppercase_ratio(text: str) -> float:
    alpha_chars = [c for c in text if c.isalpha()]
    if not alpha_chars:
        return 0.0
    return sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars)


def lexical_diversity(text: str) -> float:
    words = tokenize(text)
    if not words:
        return 0.0
    return len(set(words)) / len(words)


def repeated_word_ratio(text: str) -> float:
    words = tokenize(text)
    if not words:
        return 0.0
    word_counts: dict[str, int] = {}
    for w in words:
        word_counts[w] = word_counts.get(w, 0) + 1
    repeated = sum(c - 1 for c in word_counts.values() if c > 1)
    return repeated / len(words)


def exclamation_count(text: str) -> int:
    return text.count("!")


def average_word_length(text: str) -> float:
    words = tokenize(text)
    if not words:
        return 0.0
    return sum(len(w) for w in words) / len(words)


def extract_features(text: str) -> dict[str, float]:
    return {
        "text_length": float(text_length(text)),
        "punctuation_density": punctuation_density(text),
        "uppercase_ratio": uppercase_ratio(text),
        "lexical_diversity": lexical_diversity(text),
        "repeated_word_ratio": repeated_word_ratio(text),
        "exclamation_count": float(exclamation_count(text)),
        "average_word_length": average_word_length(text),
    }


def extract_features_batch(reviews: list[str]) -> pd.DataFrame:
    rows = [extract_features(r) for r in reviews]
    return pd.DataFrame(rows)
