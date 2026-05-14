import json
from services.ml_engine import analyze_product_data


PRODUCT_CLEAN = {
    "title": "Arzum AR1061 Blender",
    "price": "1299 TL",
    "seller": "Arzum Official Store",
    "rating": 4.3,
    "locale": "tr",
    "reviews": [
        "3 aydır kullanıyorum bu blenderı. Donmuş meyveyi gayet iyi çekiyor, temizlemesi de kolay.",
        "Fiyatına göre fena değil. Yapı kalitesi sağlam hissettiriyor ama kullanım kılavuzu daha iyi olabilirdi.",
        "Eşim hediye almıştı, başta şüpheliydim. Her gün smoothie ve çorba yapıyorum, gerçekten memnunum.",
        "Mükemmel değil ama işini görüyor. Sürahinin cam yerine plastik olması hayal kırıklığı.",
        "Eski Arzum'u bununla değiştirdim. Fiyat performans açısından şikayet edemem.",
        "Gürültü seviyesi reklamda söylenenden kesinlikle daha yüksek. Onun dışında iyi çalışıyor.",
        "Yurt odası için aldım. Boyutu ideal, protein shake yapıyorum sürekli.",
        "İki hafta kullandıktan sonra motor garip ses çıkarmaya başladı ama yenisini gönderdiler.",
    ],
}

PRODUCT_SUSPICIOUS = {
    "title": "Süper Mega Ultra Blender Pro Max 9000",
    "price": "299 TL",
    "seller": "best_deals_2024",
    "rating": 4.9,
    "locale": "tr",
    "reviews": [
        "Harika ürün! Hayatımda aldığım en iyi şey! Kesinlikle tavsiye ederim herkese! Çok memnunum!",
        "Kesinlikle harika bir ürün! Hayatımda aldığım en iyi ürün! Herkese tavsiye ederim! Çok memnun kaldım!",
        "En iyi ürün! Harika kalite! Hayatımda aldığım en güzel şey! Kesinlikle tavsiye ediyorum!",
        "Mükemmel ürün! Kesinlikle en iyi alışverişim! Herkese tavsiye ederim! Harika kalite!",
        "Bu ürün harika! En iyi alışverişim oldu! Kalitesi mükemmel! Kesinlikle herkese tavsiye ederim!",
        "Beş yıldız! Kaliteli ürün, hızlı kargo. Tekrar alırım. Teşekkürler satıcıya!",
        "Beş yıldız veriyorum! Ürün kaliteli, kargo hızlı. Tekrar sipariş veririm. Satıcıya teşekkürler!",
        "Kaliteli ürün, hızlı kargo. Beş yıldız hak ediyor. Tekrar alacağım kesinlikle!",
    ],
}

PRODUCT_EN = {
    "title": "Kitchen Pro Blender 3000",
    "price": "$49.99",
    "seller": "KitchenPro Official",
    "rating": 4.6,
    "locale": "en",
    "reviews": [
        "I've been using this blender for about 3 months now. Handles frozen fruit well and cleanup is easy.",
        "Decent product for the price. Build quality feels solid but the manual could be better.",
        "My wife bought this as a gift. After using it daily for smoothies, I'm genuinely impressed.",
        "Not perfect but gets the job done. Wish the pitcher was glass instead of plastic.",
        "Amazing product! Best purchase I've ever made! Absolutely love it! Works perfectly! Highly recommend!",
        "Absolutely amazing product! This is the best purchase ever! I love it so much! Highly recommend!",
        "Best purchase ever! Amazing product that I absolutely love! Works perfectly! Highly recommend!",
    ],
}


def run(name: str, product: dict) -> None:
    print(f"\n{'='*70}")
    print(f"  {name}")
    print(f"  Product: {product['title']}")
    print(f"  Seller: {product['seller']} | Rating: {product['rating']} | Reviews: {len(product['reviews'])}")
    print(f"{'='*70}")

    result = analyze_product_data(product)

    print(f"\n  Trust Score:              {result['trust_score']}/100")
    print(f"  Review Authenticity:      {result['review_authenticity_score']}/100")
    print(f"  Price Integrity:          {result['price_integrity_score']}/100")
    print(f"  Seller Reliability:       {result['seller_reliability_score']}/100")

    if result["risk_flags"]:
        print(f"\n  🚩 RISK FLAGS:")
        for f in result["risk_flags"]:
            print(f"    • {f}")

    print(f"\n  💡 EXPLANATIONS:")
    for e in result["explanations"]:
        print(f"    • {e}")

    if result.get("review_analysis"):
        ra = result["review_analysis"]
        print(f"\n  🔬 REVIEW ANALYSIS:")
        print(f"    Fraud Score: {ra['fraud_score']}/100")
        print(f"    Suspicious Clusters: {ra['suspicious_clusters']}")
        if ra["cluster_data"]:
            for c in ra["cluster_data"]:
                print(f"    Cluster {c['cluster_id']}: {c['size']} reviews, {c['avg_similarity']:.2%} similarity")

    print(f"\n  📦 FULL API RESPONSE:")
    safe_result = {k: v for k, v in result.items() if k != "review_analysis"}
    print(json.dumps(safe_result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    print("\n" + "="*70)
    print("  BiBak Full API Integration Test")
    print("="*70)

    run("🟢 CLEAN PRODUCT (Turkish)", PRODUCT_CLEAN)
    run("🔴 SUSPICIOUS PRODUCT (Turkish)", PRODUCT_SUSPICIOUS)
    run("🟡 MIXED PRODUCT (English)", PRODUCT_EN)

    print(f"\n{'='*70}")
    print("  Integration tests completed.")
    print(f"{'='*70}\n")
