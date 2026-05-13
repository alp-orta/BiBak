import random

RISK_FLAGS = {
    "tr": [
        "Anormal yorum duygu kümelenmesi tespit edildi",
        "Satıcı puanı yorum hacmiyle uyuşmuyor",
        "Başlıkta olası anahtar kelime doldurması"
    ],
    "en": [
        "Abnormal review sentiment clustering",
        "Seller rating does not match review volume",
        "Potential keyword stuffing in title"
    ]
}

EXPLANATIONS_SUSPICIOUS = {
    "tr": [
        "5 yıldızlı yorumların %45'inde yüksek benzerlik tespit edildi, olası bot aktivitesi."
    ],
    "en": [
        "We detected high similarity among 45% of the 5-star reviews, indicating possible bot activity."
    ]
}

EXPLANATIONS_SAFE = {
    "tr": [
        "Yorumlar doğal duygu dağılımıyla otantik görünüyor.",
        "Fiyat geçmiş trendlerle tutarlı."
    ],
    "en": [
        "Reviews appear authentic with natural sentiment distribution.",
        "Price is consistent with historical trends."
    ]
}

def analyze_product_data(product: dict) -> dict:
    title = product.get("title", "")
    rating = product.get("rating", 0)
    locale = product.get("locale", "tr")
    
    if locale not in ("tr", "en"):
        locale = "tr"

    is_suspicious = len(title) > 50 or "fake" in title.lower() or rating > 4.8

    if is_suspicious:
        return {
            "trust_score": random.randint(20, 50),
            "review_authenticity_score": random.randint(10, 40),
            "price_integrity_score": random.randint(50, 70),
            "seller_reliability_score": random.randint(20, 40),
            "risk_flags": RISK_FLAGS[locale],
            "explanations": EXPLANATIONS_SUSPICIOUS[locale],
            "safer_alternatives": [
                "https://amazon.com/dp/safer-alternative-mock"
            ]
        }
    else:
        return {
            "trust_score": random.randint(85, 98),
            "review_authenticity_score": random.randint(80, 95),
            "price_integrity_score": random.randint(90, 100),
            "seller_reliability_score": random.randint(85, 100),
            "risk_flags": [],
            "explanations": EXPLANATIONS_SAFE[locale],
            "safer_alternatives": []
        }
