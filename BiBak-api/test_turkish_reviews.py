import json
import time
from review_analyzer import analyze_reviews


AUTHENTIC_TR: list[str] = [
    "3 aydır kullanıyorum bu blenderı. Donmuş meyveyi gayet iyi çekiyor, temizlemesi de kolay. Tek sıkıntı en yüksek devirde biraz gürültülü.",
    "Fiyatına göre fena değil. Yapı kalitesi sağlam hissettiriyor ama kullanım kılavuzu daha iyi olabilirdi. Pulse özelliğini anlamam biraz sürdü.",
    "Eşim hediye almıştı, başta şüpheliydim. Her gün smoothie ve çorba yapıyorum, motor buz için bile yeterli. Gerçekten memnunum.",
    "Mükemmel değil ama işini görüyor. Sürahinin cam yerine plastik olması biraz hayal kırıklığı. Bıçaklar keskin ve homojen karıştırıyor.",
    "Eski Arzum'u bununla değiştirdim. Aynı kalite değil ama fiyat performans açısından şikayet edemem. Temel işler için yeterli.",
    "Gürültü seviyesi reklamda söylenenden kesinlikle daha yüksek. Onun dışında beklediğim gibi çalışıyor. Altındaki vantuzlar sabit tutuyor.",
    "Yurt odası için aldım. Boyutu ideal, temizlemesi kolay, protein shake yapıyorum sürekli. Seyahat kapağı güzel bonus.",
    "İki hafta kullandıktan sonra motor garip ses çıkarmaya başladı. Müşteri hizmetleri hızlı cevap verdi ve yenisini gönderdiler.",
    "Orta segment blender olarak gayet iyi. Buz kırma konusunda sıkıntı yok, yeşillik pürüzsüz karışıyor. 5 hız ayarı yeterli kontrol sağlıyor.",
    "Aynı fiyat aralığında üç farklı ürünle karşılaştırdım. Yorumları en iyi olan buydu ve katılıyorum. Süslü değil ama güvenilir.",
    "Anneme doğum günü hediyesi olarak aldım. Çok beğendi, her gün kullanıyor. Sebze çorbası için birebir.",
    "Kargo hızlıydı, ürün sağlam paketlenmişti. İlk kullanımda gayet memnun kaldım. Bakalım uzun vadede nasıl olacak.",
]

FAKE_CLUSTER_TR_1: list[str] = [
    "Harika ürün! Hayatımda aldığım en iyi şey! Kesinlikle tavsiye ederim herkese! Çok memnunum! Mükemmel kalite!",
    "Kesinlikle harika bir ürün! Hayatımda aldığım en iyi ürün! Herkese tavsiye ederim! Çok memnun kaldım! Kalitesi mükemmel!",
    "En iyi ürün! Harika kalite! Hayatımda aldığım en güzel şey! Kesinlikle tavsiye ediyorum! Çok çok memnunum!",
    "Mükemmel ürün! Kesinlikle en iyi alışverişim! Herkese tavsiye ederim! Harika kalite ve çok memnunum!",
    "Bu ürün harika! En iyi alışverişim oldu! Kalitesi mükemmel! Kesinlikle herkese tavsiye ederim! Süper memnunum!",
    "Aldığım en iyi ürün! Harika! Mükemmel kalite! Tavsiye ederim herkese! Çok memnun kaldım gerçekten!",
]

FAKE_CLUSTER_TR_2: list[str] = [
    "Beş yıldız! Kaliteli ürün, hızlı kargo, açıklamaya uygun. Tekrar alırım. Teşekkürler satıcıya!",
    "Beş yıldız veriyorum! Ürün kaliteli, kargo hızlı, tam açıklandığı gibi. Tekrar sipariş veririm. Satıcıya teşekkürler!",
    "Kaliteli ürün, hızlı kargo. Beş yıldız hak ediyor. Açıklamaya birebir uyuyor. Tekrar alacağım kesinlikle. Teşekkürler!",
    "Ürün açıklamaya uygun, kalitesi iyi, kargo çok hızlıydı. Beş yıldız! Tekrar alırım. Satıcıya teşekkürler!",
    "Beş yıldız! Harika kalite ve süper hızlı kargo. Açıklamadaki gibi geldi. Kesinlikle tekrar alışveriş yaparım!",
]

MIXED_TR: list[str] = AUTHENTIC_TR + FAKE_CLUSTER_TR_1 + FAKE_CLUSTER_TR_2


def run_test(name: str, reviews: list[str]) -> None:
    print(f"\n{'='*70}")
    print(f"  TEST: {name}")
    print(f"  Reviews: {len(reviews)}")
    print(f"{'='*70}")

    start = time.time()
    result = analyze_reviews(reviews)
    elapsed = time.time() - start

    print(f"\n  Fraud Score:              {result['fraud_score']}/100")
    print(f"  Review Authenticity:      {result['review_authenticity_score']}/100")
    print(f"  Suspicious Clusters:      {result['suspicious_clusters']}")
    print(f"  Analysis Time:            {elapsed:.2f}s")

    print(f"\n  REASONS:")
    for reason in result["reasons"]:
        print(f"    • {reason}")

    if result["cluster_data"]:
        print(f"\n  CLUSTER DATA:")
        for c in result["cluster_data"]:
            print(f"    Cluster {c['cluster_id']}: {c['size']} reviews, "
                  f"avg similarity: {c['avg_similarity']:.2%}")
            for sample in c["sample_texts"]:
                print(f"      → \"{sample}...\"")

    print(f"\n  PER-REVIEW SCORES:")
    for r in result["review_scores"]:
        flags_str = ", ".join(r["flags"]) if r["flags"] else "clean"
        print(f"    [{r['index']:2d}] fraud={r['fraud_score']:3d}  "
              f"anomaly={r['anomaly_score']:.3f}  "
              f"cluster={r['cluster_id']:2d}  "
              f"[{flags_str}]  "
              f"\"{r['text_snippet'][:50]}...\"")


if __name__ == "__main__":
    print("\n" + "="*70)
    print("  BiBak Review Fraud Detection — Turkish Test Suite")
    print("="*70)

    run_test("Gerçek Türkçe Yorumlar", AUTHENTIC_TR)
    run_test("Sahte Yorum Kümesi 1 (6 yorum)", FAKE_CLUSTER_TR_1)
    run_test("Sahte Yorum Kümesi 2 (5 yorum)", FAKE_CLUSTER_TR_2)
    run_test("Karışık Yorumlar (12 gerçek + 11 sahte)", MIXED_TR)

    print(f"\n{'='*70}")
    print("  All tests completed.")
    print(f"{'='*70}\n")
