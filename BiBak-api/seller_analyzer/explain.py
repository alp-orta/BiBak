from __future__ import annotations

from .schemas import SellerFeatureSummary


def generate_seller_explanations(
    features: SellerFeatureSummary,
    seller_flags: list[str],
    locale: str = "en",
) -> list[str]:
    is_tr = locale == "tr"
    explanations: list[str] = []

    if features.marketplace_seller_score is not None:
        explanations.append(
            f"Satıcının pazar yeri puanı {features.marketplace_seller_score:g}/10"
            if is_tr and features.marketplace_seller_score <= 10
            else f"Satıcının pazar yeri puanı {features.marketplace_seller_score:.0f}/100"
            if is_tr
            else f"Seller has a marketplace rating of {features.marketplace_seller_score:g}/10"
            if features.marketplace_seller_score <= 10
            else f"Seller has a marketplace rating of {features.marketplace_seller_score:.0f}/100"
        )
    else:
        explanations.append("Satıcı pazar yeri puanı okunamadı" if is_tr else "Marketplace seller rating is not available")

    if features.seller_follower_count and features.seller_follower_count >= 10_000:
        explanations.append("Satıcının pazar yerinde güçlü bir görünürlüğü var" if is_tr else "Seller has strong marketplace traction")
    elif "limited_marketplace_traction" in seller_flags:
        explanations.append("Satıcı görünürlüğü sınırlı veya okunamadı" if is_tr else "Seller marketplace traction is limited or unavailable")

    if features.verified_badge_available:
        explanations.append("Satıcının doğrulanmış pazar yeri rozeti var" if is_tr else "Seller has a verified marketplace badge")

    if features.seller_age_days is not None:
        if features.seller_age_days < 90:
            explanations.append("Satıcı hesabı yeni olduğu için güven puanı daha temkinli hesaplandı" if is_tr else "Seller account is new, so reliability is scored more cautiously")
        elif features.seller_age_days >= 365:
            explanations.append("Satıcı uzun süredir aktif görünüyor" if is_tr else "Seller appears to have a long operating history")

    if features.fast_delivery_available or features.free_shipping_available:
        explanations.append("Teslimat sinyalleri güvenilir görünüyor" if is_tr else "Fulfillment signals appear reliable")
    elif "limited_fulfillment_signals" in seller_flags:
        explanations.append("Teslimat güvenilirliği için yeterli sinyal yok" if is_tr else "Fulfillment reliability signals are limited")

    if features.observed_seller_history_count < 3:
        explanations.append("BiBak bu satıcı için sınırlı geçmiş gözleme sahip" if is_tr else "BiBak has limited historical observations for this seller")
    elif features.avg_historical_trust_score is not None:
        explanations.append(
            f"BiBak satıcı geçmişi ortalama {features.avg_historical_trust_score:.0f}/100 güven puanı gösteriyor"
            if is_tr
            else f"BiBak seller history averages {features.avg_historical_trust_score:.0f}/100 trust"
        )

    if "weak_seller_identity" in seller_flags:
        explanations.append(
            "Satıcı kimliği zayıf çünkü önemli pazar yeri sinyalleri eksik"
            if is_tr
            else "Seller identity confidence is weak because key marketplace signals are missing"
        )

    if features.product_context_risk >= 65:
        explanations.append(
            "Bu ürünün riski satıcı puanını en fazla 5 puan etkiler"
            if is_tr
            else "Current product risk slightly reduces seller reliability, capped at 5 points"
        )

    return explanations[:5]
