from review_analyzer import analyze_reviews
import re


RISK_FLAG_MAP = {
    "tr": {
        "semantic_cluster": "Anormal yorum benzerliği tespit edildi",
        "statistical_outlier": "İstatistiksel olarak anormal yorum kalıpları saptandı",
        "low_lexical_diversity": "Düşük kelime çeşitliliği — şablon yazım şüphesi",
        "high_word_repetition": "Aşırı kelime tekrarı — bot aktivitesi olasılığı",
        "high_fraud": "Yorum güvenilirliği düşük",
        "price_ok": "Fiyat geçmiş trendlerle tutarlı",
        "seller_ok": "Satıcı profili normal görünüyor",
    },
    "en": {
        "semantic_cluster": "Abnormal review similarity detected",
        "statistical_outlier": "Statistically anomalous review patterns found",
        "low_lexical_diversity": "Low lexical diversity — templated writing suspected",
        "high_word_repetition": "Excessive word repetition — possible bot activity",
        "high_fraud": "Review authenticity is low",
        "price_ok": "Price is consistent with historical trends",
        "seller_ok": "Seller profile appears normal",
    },
}


def _derive_risk_flags(analysis: dict, locale: str) -> list[str]:
    flags_map = RISK_FLAG_MAP.get(locale, RISK_FLAG_MAP["en"])
    flags: list[str] = []

    review_count = max(len(analysis["review_scores"]), 1)
    clustered_ratio = sum(1 for r in analysis["review_scores"] if r.get("cluster_id", -1) != -1) / review_count
    outlier_ratio = sum(
        1 for r in analysis["review_scores"]
        if "statistical_outlier" in r.get("flags", [])
    ) / review_count
    low_diversity_ratio = sum(
        1 for r in analysis["review_scores"]
        if "low_lexical_diversity" in r.get("flags", [])
    ) / review_count
    high_rep_ratio = sum(
        1 for r in analysis["review_scores"]
        if "high_word_repetition" in r.get("flags", [])
    ) / review_count

    has_clusters = analysis["suspicious_clusters"] > 0 and clustered_ratio >= 0.25
    if has_clusters:
        flags.append(flags_map["semantic_cluster"])

    if outlier_ratio >= 0.2:
        flags.append(flags_map["statistical_outlier"])

    if low_diversity_ratio >= 0.2:
        flags.append(flags_map["low_lexical_diversity"])

    if high_rep_ratio >= 0.15:
        flags.append(flags_map["high_word_repetition"])

    if analysis["fraud_score"] >= 55:
        flags.append(flags_map["high_fraud"])

    return flags


def _compute_seller_score(rating: float, review_count: int, fraud_score: int) -> int:
    base = min(int(rating * 20), 100)
    volume_bonus = min(review_count, 10) * 2
    fraud_penalty = int(fraud_score * 0.5)
    return max(0, min(100, base + volume_bonus - fraud_penalty))


def _compute_price_score(fraud_score: int) -> int:
    if fraud_score > 60:
        return max(40, 85 - fraud_score)
    return min(100, 90 + (100 - fraud_score) // 10)


def _normalize_review(text: str) -> str:
    return " ".join((text or "").lower().split())


NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)

PACKAGING_TERMS = (
    "paket", "paketleme", "ambalaj", "kargo", "teslim", "hediye", "maske", "kutulama",
    "shipping", "delivery", "package", "packaging", "gift", "arrived",
)
PRE_USE_TERMS = (
    "kullanmad", "denemed", "yeni kullan", "yeni başlad", "yorumu güncelle", "yorumumu güncelle",
    "etkisini gör", "bakalım", "inşallah", "umarım", "bir ay bak", "not used", "just started",
    "will update", "haven't used", "haven’t used", "newly started", "try it",
)
BENEFIT_TERMS = (
    "iyi geldi", "faydas", "memnun", "rahatla", "azald", "düzeldi", "bitti", "net görüş",
    "yanma", "kuruluk", "okuyabili", "destek oldu", "worked", "helped", "improved",
    "relief", "better", "no more", "reduced",
)
NEGATIVE_TERMS = (
    "işe yaramadı", "pek işe yaramadı", "fark görmedim", "memnun kalmad", "etkisini görmedim",
    "kuruluk devam", "yaramadı", "didn't work", "did not work", "no difference", "not helpful",
)


def _compact_text(text: str) -> str:
    lowered = _normalize_review(text)
    return NON_WORD_RE.sub(" ", lowered)


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _summarize_review_mix(reviews: list[str], analysis: dict) -> dict:
    compact_reviews = [_compact_text(review) for review in reviews]
    review_count = len(compact_reviews)
    if review_count == 0:
        return {
            "review_count": 0,
            "packaging_ratio": 0.0,
            "pre_use_ratio": 0.0,
            "benefit_ratio": 0.0,
            "negative_ratio": 0.0,
            "detailed_ratio": 0.0,
            "clustered_ratio": 0.0,
            "outlier_ratio": 0.0,
            "high_risk_ratio": 0.0,
        }

    packaging_ratio = sum(_contains_any(text, PACKAGING_TERMS) for text in compact_reviews) / review_count
    pre_use_ratio = sum(_contains_any(text, PRE_USE_TERMS) for text in compact_reviews) / review_count
    benefit_ratio = sum(_contains_any(text, BENEFIT_TERMS) for text in compact_reviews) / review_count
    negative_ratio = sum(_contains_any(text, NEGATIVE_TERMS) for text in compact_reviews) / review_count
    detailed_ratio = sum(len(text.split()) >= 18 for text in compact_reviews) / review_count
    clustered_ratio = sum(r.get("cluster_id", -1) != -1 for r in analysis["review_scores"]) / review_count
    outlier_ratio = sum("statistical_outlier" in r.get("flags", []) for r in analysis["review_scores"]) / review_count
    high_risk_ratio = sum(r.get("fraud_score", 0) >= 60 for r in analysis["review_scores"]) / review_count

    return {
        "review_count": review_count,
        "packaging_ratio": packaging_ratio,
        "pre_use_ratio": pre_use_ratio,
        "benefit_ratio": benefit_ratio,
        "negative_ratio": negative_ratio,
        "detailed_ratio": detailed_ratio,
        "clustered_ratio": clustered_ratio,
        "outlier_ratio": outlier_ratio,
        "high_risk_ratio": high_risk_ratio,
    }


def _build_review_explanations(
    reviews: list[str],
    rating: float,
    analysis: dict,
    locale: str,
) -> list[str]:
    summary = _summarize_review_mix(reviews, analysis)
    fraud = analysis["fraud_score"]
    explanations: list[str] = []

    if locale == "tr":
        if fraud >= 55 or summary["clustered_ratio"] >= 0.35:
            explanations.append(
                f"Yorumların yaklaşık %{round(summary['clustered_ratio'] * 100)} kadarı birbirine aşırı benzer kalıplarda; bu, puanların güvenilirliğini aşağı çekiyor."
            )
        elif rating >= 4.0 and fraud <= 25:
            explanations.append(
                f"Yorum tonu genel olarak {rating:.1f}/5 puanla uyumlu; görünür yorumlarda güçlü bir toplu sahtecilik paterni yok."
            )
        else:
            explanations.append(
                "Yorumlar tamamen tutarsız görünmüyor, ancak güven puanı birkaç kalite sinyali nedeniyle temkinli hesaplandı."
            )

        if summary["packaging_ratio"] >= 0.3:
            explanations.append(
                f"Yorumların yaklaşık %{round(summary['packaging_ratio'] * 100)} kadarı paketleme, kargo veya hediyeden bahsediyor; bunlar satıcı deneyimini anlatıyor, ürün etkisini sınırlı ölçüyor."
            )

        if summary["pre_use_ratio"] >= 0.2:
            explanations.append(
                f"Yorumların yaklaşık %{round(summary['pre_use_ratio'] * 100)} kadarı ürünü yeni denediğini veya henüz kullanmadığını söylüyor; bu yüzden yorum hacmi yüksek olsa da kanıt kalitesi orta seviyede."
            )

        if summary["benefit_ratio"] >= 0.15:
            explanations.append(
                f"Yaklaşık %{round(summary['benefit_ratio'] * 100)} yorum somut etki veya kullanım sonucu anlatıyor; güven veren kısım esas olarak bu daha detaylı yorumlar."
            )

        if summary["negative_ratio"] >= 0.15:
            explanations.append(
                f"Yaklaşık %{round(summary['negative_ratio'] * 100)} yorum belirgin fayda görmediğini söylüyor; olumlu puana rağmen sonuçlar herkes için aynı değil."
            )
    else:
        if fraud >= 55 or summary["clustered_ratio"] >= 0.35:
            explanations.append(
                f"About {round(summary['clustered_ratio'] * 100)}% of the reviews follow highly similar wording patterns, which materially lowers confidence in the score."
            )
        elif rating >= 4.0 and fraud <= 25:
            explanations.append(
                f"The overall review tone is broadly consistent with the {rating:.1f}/5 rating, and the visible sample does not show a strong coordinated-review pattern."
            )
        else:
            explanations.append(
                "The reviews are not obviously manipulated, but the trust score stays cautious because the evidence quality is mixed."
            )

        if summary["packaging_ratio"] >= 0.3:
            explanations.append(
                f"About {round(summary['packaging_ratio'] * 100)}% of the reviews focus on packaging, shipping, or gifts rather than product performance."
            )

        if summary["pre_use_ratio"] >= 0.2:
            explanations.append(
                f"About {round(summary['pre_use_ratio'] * 100)}% of the reviews were written before meaningful use or explicitly say the reviewer is still testing the product."
            )

        if summary["benefit_ratio"] >= 0.15:
            explanations.append(
                f"About {round(summary['benefit_ratio'] * 100)}% of the reviews describe concrete outcomes or usage results, which is the strongest evidence in this sample."
            )

        if summary["negative_ratio"] >= 0.15:
            explanations.append(
                f"About {round(summary['negative_ratio'] * 100)}% of the reviews report little or no benefit, so the positive rating should not be treated as universal product fit."
            )

    return explanations[:4]


def _fallback_analysis(product: dict, locale: str, error_message: str) -> dict:
    flags_map = RISK_FLAG_MAP.get(locale, RISK_FLAG_MAP["en"])
    reviews = [r for r in product.get("reviews", []) if isinstance(r, str) and r.strip()]
    rating = float(product.get("rating", 0.0) or 0.0)
    seller = str(product.get("seller", "") or "").strip()
    price = str(product.get("price", "") or "").strip()
    has_price = bool(price and price != "N/A")
    has_seller = bool(seller and seller != "N/A")

    normalized = [_normalize_review(review) for review in reviews]
    unique_count = len(set(normalized))
    review_count = len(normalized)
    duplicate_ratio = 0.0 if review_count == 0 else 1.0 - (unique_count / review_count)
    avg_length = 0.0 if review_count == 0 else sum(len(review) for review in normalized) / review_count

    authenticity = 78
    authenticity -= int(duplicate_ratio * 45)
    if review_count < 3:
        authenticity -= 12
    if 0 < avg_length < 45:
        authenticity -= 10
    authenticity = max(25, min(95, authenticity))

    fraud = max(0, 100 - authenticity)
    price_score = 85 if has_price else 65
    seller_score = min(100, int(rating * 20)) if rating > 0 else 65
    if not has_seller:
        seller_score -= 15
    seller_score = max(40, min(95, seller_score))

    trust_score = int(authenticity * 0.45 + price_score * 0.25 + seller_score * 0.30)

    risk_flags: list[str] = []
    if duplicate_ratio >= 0.3:
        risk_flags.append(flags_map["high_word_repetition"])
    if fraud > 40:
        risk_flags.append(flags_map["high_fraud"])

    explanations = [
        flags_map["price_ok"] if has_price else "Price data is missing",
        flags_map["seller_ok"] if has_seller else "Seller data is incomplete",
        f"Fallback analysis used after ML pipeline failure: {error_message[:120]}",
    ]

    return {
        "trust_score": max(0, min(100, trust_score)),
        "review_authenticity_score": authenticity,
        "price_integrity_score": max(0, min(100, price_score)),
        "seller_reliability_score": seller_score,
        "risk_flags": risk_flags,
        "explanations": explanations,
        "safer_alternatives": [],
        "review_analysis": None,
    }


def analyze_product_data(product: dict) -> dict:
    reviews = product.get("reviews", [])
    title = product.get("title", "")
    rating = product.get("rating", 0.0)
    locale = product.get("locale", "tr")

    if locale not in ("tr", "en"):
        locale = "tr"

    if not reviews or len(reviews) < 2:
        flags_map = RISK_FLAG_MAP.get(locale, RISK_FLAG_MAP["en"])
        return {
            "trust_score": 75,
            "review_authenticity_score": 75,
            "price_integrity_score": 90,
            "seller_reliability_score": 70,
            "risk_flags": [],
            "explanations": [
                flags_map["price_ok"],
                flags_map["seller_ok"],
            ],
            "safer_alternatives": [],
            "review_analysis": None,
        }

    try:
        analysis = analyze_reviews(reviews)
    except Exception as exc:
        return _fallback_analysis(product, locale, str(exc))

    fraud = analysis["fraud_score"]
    authenticity = analysis["review_authenticity_score"]
    price_score = _compute_price_score(fraud)
    seller_score = _compute_seller_score(rating, len(reviews), fraud)
    summary = _summarize_review_mix(reviews, analysis)

    rating_signal = min(int(rating * 20), 100) if rating > 0 else 70
    base_trust = (
        authenticity * 0.6
        + seller_score * 0.2
        + price_score * 0.1
        + rating_signal * 0.1
    )
    evidence_penalty = round(
        summary["packaging_ratio"] * 10
        + summary["pre_use_ratio"] * 18
        + max(0.0, 0.2 - summary["detailed_ratio"]) * 30
        + summary["negative_ratio"] * 15
    )
    trust_score = max(0, min(100, int(round(base_trust - evidence_penalty))))

    risk_flags = _derive_risk_flags(analysis, locale)
    explanations = _build_review_explanations(reviews, rating, analysis, locale)

    safer_alternatives: list[str] = []
    if fraud > 50:
        safer_alternatives.append("https://amazon.com/dp/safer-alternative-mock")

    return {
        "trust_score": trust_score,
        "review_authenticity_score": authenticity,
        "price_integrity_score": price_score,
        "seller_reliability_score": seller_score,
        "risk_flags": risk_flags,
        "explanations": explanations,
        "safer_alternatives": safer_alternatives,
        "review_analysis": {
            "fraud_score": fraud,
            "suspicious_clusters": analysis["suspicious_clusters"],
            "cluster_data": analysis["cluster_data"],
            "review_scores": analysis["review_scores"],
        },
    }
