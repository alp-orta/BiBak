from review_analyzer import analyze_reviews
from models.api_models import ProductRequest
from services import history_store
from services.trust_signals import (
    build_price_analysis,
    build_purchase_timing,
    build_safer_alternatives,
    build_seller_analysis,
    resolve_current_price,
)
import re


TRUST_SCORE_WEIGHTS = {
    "review": 0.45,
    "price": 0.30,
    "seller": 0.25,
}


RISK_FLAG_MAP = {
    "tr": {
        "semantic_cluster": "Bazı yorumlar birbirine çok benziyor",
        "statistical_outlier": "Bazı yorumlar normalden farklı görünüyor",
        "low_lexical_diversity": "Bazı yorumlar kopya gibi duruyor",
        "high_word_repetition": "Bazı yorumlarda aynı kelimeler çok tekrar ediyor",
        "high_fraud": "Yorum güvenilirliği düşük",
        "suspicious_discount": "İndirim şüpheli görünüyor",
        "limited_price_history": "Bu ürün için az fiyat bilgisi var",
        "seller_review_risk": "Satıcı yorumlarına dikkat etmek gerek",
        "limited_seller_history": "Satıcı hakkında az bilgi var",
        "low_scrape_confidence": "Sayfadaki bilgiler tam okunamadı",
        "price_ok": "Fiyat normal görünüyor",
        "seller_ok": "Satıcı normal görünüyor",
    },
    "en": {
        "semantic_cluster": "Some reviews look very similar",
        "statistical_outlier": "Some reviews look unusual",
        "low_lexical_diversity": "Some reviews look copied",
        "high_word_repetition": "Some reviews repeat the same words",
        "high_fraud": "Review trust is low",
        "suspicious_discount": "The discount looks suspicious",
        "limited_price_history": "There is little price info",
        "seller_review_risk": "Some seller reviews need attention",
        "limited_seller_history": "There is little seller info",
        "low_scrape_confidence": "Some page info could not be read",
        "price_ok": "The price looks normal",
        "seller_ok": "The seller looks normal",
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

    fraud_score = analysis["fraud_score"]
    has_clusters = analysis["suspicious_clusters"] > 0 and clustered_ratio >= 0.25 and fraud_score >= 35
    if has_clusters:
        flags.append(flags_map["semantic_cluster"])

    if outlier_ratio >= 0.2 and fraud_score >= 35:
        flags.append(flags_map["statistical_outlier"])

    if low_diversity_ratio >= 0.2 and fraud_score >= 35:
        flags.append(flags_map["low_lexical_diversity"])

    if high_rep_ratio >= 0.15 and fraud_score >= 35:
        flags.append(flags_map["high_word_repetition"])

    if fraud_score >= 55:
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


def _normalize_product(product: dict) -> dict:
    return ProductRequest.from_dict(product).to_dict()


def _scrape_confidence(product: dict) -> int | None:
    metadata = product.get("scrape_metadata") or {}
    confidence = metadata.get("confidence")
    return confidence if isinstance(confidence, int) else None


def _extract_scrape_warnings(product: dict) -> list[str]:
    metadata = product.get("scrape_metadata") or {}
    warnings = metadata.get("warnings") or []
    return [str(warning) for warning in warnings if isinstance(warning, str)]


def _build_contextual_signals(product: dict, fraud_score: int, locale: str) -> tuple[dict, dict, dict, list[str]]:
    product_key = history_store.make_product_key(product)
    product_history = history_store.get_product_snapshots(product_key)
    seller_history = history_store.get_seller_snapshots(product["platform"], product["seller"])
    scrape_confidence = _scrape_confidence(product)

    price_analysis = build_price_analysis(product, product_history, locale)
    seller_analysis = build_seller_analysis(
        product,
        seller_history,
        fraud_score,
        scrape_confidence,
        locale,
        pricing_signals=_build_pricing_signals(product, price_analysis),
    )
    purchase_timing = build_purchase_timing(price_analysis, locale)

    warnings = list(dict.fromkeys(
        price_analysis.get("warnings", [])
        + seller_analysis.get("warnings", [])
        + _extract_scrape_warnings(product)
    ))
    if scrape_confidence is not None and scrape_confidence < 55 and "low_scrape_confidence" not in warnings:
        warnings.append("low_scrape_confidence")

    return price_analysis, seller_analysis, purchase_timing, warnings


def _build_contextual_signals_with_review_analysis(product: dict, analysis: dict, locale: str) -> tuple[dict, dict, dict, list[str]]:
    product_key = history_store.make_product_key(product)
    product_history = history_store.get_product_snapshots(product_key)
    seller_history = history_store.get_seller_snapshots(product["platform"], product["seller"])
    scrape_confidence = _scrape_confidence(product)

    price_analysis = build_price_analysis(product, product_history, locale)
    seller_analysis = build_seller_analysis(
        product,
        seller_history,
        analysis["fraud_score"],
        scrape_confidence,
        locale,
        review_analysis=analysis,
        pricing_signals=_build_pricing_signals(product, price_analysis),
    )
    purchase_timing = build_purchase_timing(price_analysis, locale)

    warnings = list(dict.fromkeys(
        price_analysis.get("warnings", [])
        + seller_analysis.get("warnings", [])
        + _extract_scrape_warnings(product)
    ))
    if scrape_confidence is not None and scrape_confidence < 55 and "low_scrape_confidence" not in warnings:
        warnings.append("low_scrape_confidence")

    return price_analysis, seller_analysis, purchase_timing, warnings


def _build_pricing_signals(product: dict, price_analysis: dict) -> list[dict]:
    explicit = product.get("pricing_signals") or []
    if isinstance(explicit, dict):
        explicit = [explicit]
    signals = [item for item in explicit if isinstance(item, dict)] if isinstance(explicit, list) else []

    current = price_analysis.get("current_price")
    observed_high = price_analysis.get("observed_high")
    latest_history = price_analysis.get("latest_history_price")
    if isinstance(current, (int, float)) and current > 0:
        anchor_candidates = [
            value for value in (observed_high, latest_history)
            if isinstance(value, (int, float)) and value > current
        ]
        if anchor_candidates:
            original_price = max(anchor_candidates)
            signals.append({
                "original_price": original_price,
                "sale_price": current,
                "discount_percent": (original_price - current) / original_price * 100.0,
                "source": price_analysis.get("source") or "price_analysis",
            })

    return signals


def _append_contextual_flags(risk_flags: list[str], warnings: list[str], locale: str) -> list[str]:
    flags_map = RISK_FLAG_MAP.get(locale, RISK_FLAG_MAP["en"])
    additions = {
        "suspicious_discount_pattern": "suspicious_discount",
        "current_price_above_history": "suspicious_discount",
        "limited_seller_history": "limited_seller_history",
        "seller_review_risk": "seller_review_risk",
        "low_scrape_confidence": "low_scrape_confidence",
        "missing_marketplace_seller_score": "limited_seller_history",
        "low_marketplace_seller_score": "seller_review_risk",
        "weak_seller_identity": "limited_seller_history",
        "limited_fulfillment_signals": "limited_seller_history",
        "limited_marketplace_traction": "limited_seller_history",
        "product_context_risk": "seller_review_risk",
        "seller_trust_critical": "seller_review_risk",
    }
    for warning, flag_key in additions.items():
        if warning in warnings:
            flag = flags_map[flag_key]
            if flag not in risk_flags:
                risk_flags.append(flag)
    return risk_flags


def _contextual_explanations(price_analysis: dict, seller_analysis: dict, purchase_timing: dict) -> list[str]:
    explanations = [
        item
        for item in (
            seller_analysis.get("explanation"),
        )
        if isinstance(item, str) and item
    ]
    explanations.extend(
        item
        for item in seller_analysis.get("explanations", [])
        if isinstance(item, str) and item and item not in explanations
    )
    return explanations


def _compute_trust_score(
    review_authenticity: int,
    price_integrity: int,
    seller_reliability: int,
    evidence_penalty: int = 0,
) -> int:
    weighted_score = (
        review_authenticity * TRUST_SCORE_WEIGHTS["review"]
        + price_integrity * TRUST_SCORE_WEIGHTS["price"]
        + seller_reliability * TRUST_SCORE_WEIGHTS["seller"]
    )
    return max(0, min(100, int(round(weighted_score - evidence_penalty))))


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
                f"Yorumların yaklaşık %{round(summary['clustered_ratio'] * 100)} kadarı birbirine çok benziyor. Bu yüzden yorum puanı düşük."
            )
        elif rating >= 4.0 and fraud <= 25:
            explanations.append(
                f"Yorumlar {rating:.1f}/5 puanla uyumlu görünüyor. Belirgin şüpheli yorum yok."
            )
        else:
            explanations.append(
                "Yorumlarda biraz karışık durum var. Bu yüzden puan dikkatli hesaplandı."
            )

        if summary["packaging_ratio"] >= 0.3:
            explanations.append(
                f"Yorumların yaklaşık %{round(summary['packaging_ratio'] * 100)} kadarı kargo veya paketlemeden bahsediyor. Bunlar ürünün kendisini tam anlatmaz."
            )

        if summary["pre_use_ratio"] >= 0.2:
            explanations.append(
                f"Yorumların yaklaşık %{round(summary['pre_use_ratio'] * 100)} kadarı ürünü daha yeni denemiş. Bu yüzden yorumlara biraz dikkatli bakın."
            )

        if summary["benefit_ratio"] >= 0.15:
            explanations.append(
                f"Yaklaşık %{round(summary['benefit_ratio'] * 100)} yorum ürünü gerçekten kullanıp anlatıyor. En faydalı yorumlar bunlar."
            )

        if summary["negative_ratio"] >= 0.15:
            explanations.append(
                f"Yaklaşık %{round(summary['negative_ratio'] * 100)} yorum üründen memnun kalmamış. Herkes için iyi sonuç vermeyebilir."
            )
    else:
        if fraud >= 55 or summary["clustered_ratio"] >= 0.35:
            explanations.append(
                f"About {round(summary['clustered_ratio'] * 100)}% of reviews look very similar. This lowers the review score."
            )
        elif rating >= 4.0 and fraud <= 25:
            explanations.append(
                f"Reviews match the {rating:.1f}/5 rating. Nothing clearly suspicious is visible."
            )
        else:
            explanations.append(
                "The reviews are a bit mixed, so the score is careful."
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
    reviews = product["reviews"]

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
    price_analysis, seller_analysis, purchase_timing, warnings = _build_contextual_signals(product, fraud, locale)
    price_score = price_analysis["score"]
    seller_score = seller_analysis["score"]

    trust_score = _compute_trust_score(authenticity, price_score, seller_score)

    risk_flags: list[str] = []
    if duplicate_ratio >= 0.3:
        risk_flags.append(flags_map["high_word_repetition"])
    if fraud > 40:
        risk_flags.append(flags_map["high_fraud"])
    risk_flags = _append_contextual_flags(risk_flags, warnings, locale)

    explanations = _contextual_explanations(price_analysis, seller_analysis, purchase_timing)
    explanations.append(f"Fallback analysis used after ML pipeline failure: {error_message[:120]}")
    warnings = list(dict.fromkeys(["ml_pipeline_failed"] + warnings))

    price_info = resolve_current_price(product)
    history_store.record_snapshot(product, price_info, fraud, trust_score)

    return {
        "trust_score": max(0, min(100, trust_score)),
        "review_authenticity_score": authenticity,
        "price_integrity_score": max(0, min(100, price_score)),
        "seller_reliability_score": seller_score,
        "risk_flags": risk_flags,
        "explanations": explanations,
        "safer_alternatives": [],
        "review_analysis": None,
        "price_analysis": price_analysis,
        "seller_analysis": seller_analysis,
        "purchase_timing": purchase_timing,
        "source": "fallback",
        "warnings": warnings,
    }


def analyze_product_data(product: dict) -> dict:
    product = _normalize_product(product)
    reviews = product["reviews"]
    rating = product["rating"]
    locale = product["locale"]

    if not reviews or len(reviews) < 2:
        fraud = 55 if not reviews else 40
        authenticity = 35 if not reviews else 55
        price_analysis, seller_analysis, purchase_timing, warnings = _build_contextual_signals(product, fraud, locale)
        price_score = price_analysis["score"]
        seller_score = seller_analysis["score"]
        evidence_penalty = 8 if not reviews else 4
        trust_score = _compute_trust_score(authenticity, price_score, seller_score, evidence_penalty)
        risk_flags = _append_contextual_flags([], warnings, locale)
        explanations = _contextual_explanations(price_analysis, seller_analysis, purchase_timing)
        explanations.insert(
            0,
            "Bu üründe yorum yok. Bu yüzden yorum puanı kesin değil."
            if not reviews and locale == "tr"
            else "This product has no reviews, so the review score is not certain."
            if not reviews
            else "Yorum sayısı çok az. Bu yüzden sonuç kesin değil."
            if locale == "tr"
            else "There are very few reviews, so the result is not final."
        )
        price_info = resolve_current_price(product)
        alternatives = build_safer_alternatives(product, trust_score, price_score)
        history_store.record_snapshot(product, price_info, fraud, trust_score)

        return {
            "trust_score": trust_score,
            "review_authenticity_score": authenticity,
            "price_integrity_score": price_score,
            "seller_reliability_score": seller_score,
            "risk_flags": risk_flags,
            "explanations": explanations,
            "safer_alternatives": alternatives,
            "review_analysis": None,
            "price_analysis": price_analysis,
            "seller_analysis": seller_analysis,
            "purchase_timing": purchase_timing,
            "source": "api",
            "warnings": list(dict.fromkeys((["no_reviews"] if not reviews else ["limited_review_data"]) + warnings)),
        }

    try:
        analysis = analyze_reviews(reviews)
    except Exception as exc:
        return _fallback_analysis(product, locale, str(exc))

    fraud = analysis["fraud_score"]
    authenticity = analysis["review_authenticity_score"]
    price_analysis, seller_analysis, purchase_timing, warnings = _build_contextual_signals_with_review_analysis(product, analysis, locale)
    price_score = price_analysis["score"]
    seller_score = seller_analysis["score"]
    summary = _summarize_review_mix(reviews, analysis)

    scrape_confidence = _scrape_confidence(product)
    scrape_penalty = 0 if scrape_confidence is None else max(0, 55 - scrape_confidence) * 0.25
    evidence_penalty = round(
        summary["packaging_ratio"] * 10
        + summary["pre_use_ratio"] * 18
        + max(0.0, 0.2 - summary["detailed_ratio"]) * 30
        + summary["negative_ratio"] * 15
        + scrape_penalty
    )
    trust_score = _compute_trust_score(authenticity, price_score, seller_score, evidence_penalty)

    risk_flags = _append_contextual_flags(_derive_risk_flags(analysis, locale), warnings, locale)
    explanations = _build_review_explanations(reviews, rating, analysis, locale)
    explanations.extend(_contextual_explanations(price_analysis, seller_analysis, purchase_timing))
    explanations = explanations[:7]

    safer_alternatives = build_safer_alternatives(product, trust_score, price_score)
    price_info = resolve_current_price(product)
    history_store.record_snapshot(product, price_info, fraud, trust_score)

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
        "price_analysis": price_analysis,
        "seller_analysis": seller_analysis,
        "purchase_timing": purchase_timing,
        "source": "api",
        "warnings": warnings,
    }
