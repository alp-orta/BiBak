# BiBak Econ/UI Action Plan

## 1. UI Polish Checklist

Amaç: Kullanıcı ilk 5 saniyede "alınır mı, dikkat mi, uzak dur mu?" cevabını görmeli.

- Üst alan:
  - Trust Score
  - Kısa karar cümlesi
  - Veri azsa kısa uyarı: "Sonuç kesin değil."
- Orta alan:
  - Yorum Güvenilirliği
  - Fiyat Tutarlılığı
  - Satıcı Güvenilirliği
- Kanıt alanı:
  - Sadece eldeki veriye göre anlamlı kartlar gösterilir.
  - Yorum yoksa yorum kanıtı gösterilmez.
  - Fiyat geçmişi yoksa eski fiyat alanlarında "Fiyat bilgisi yok" yazar.
- İkon kuralları:
  - Normal/güvenli bilgi: yeşil tik
  - Dikkat isteyen bilgi: amber uyarı
  - Gerçek risk: kırmızı uyarı
  - Şüpheli bir şey yoksa ünlem kullanılmaz.

## 2. Kanıt Kartı Yazım Kuralı

Her kanıt kartı mümkün olduğunca şu soruları cevaplamalı:

| Soru | Kullanıcıya Görünecek Dil |
|---|---|
| Ne gördük? | "Bazı yorumlar birbirine çok benziyor." |
| Neden önemli? | "Bu yorumlar doğal olmayabilir." |
| Ne yapmalısın? | "Orta puanlı yorumlara da bak." |

Kullanılmayacak ifadeler:

- "anomali skoru"
- "semantik cluster"
- "model confidence"
- "manipülasyon paterni"
- "istatistiksel outlier"

## 3. Demo Senaryoları

### Senaryo A: Güvenilir Ürün

- Amaç: BiBak'in iyi ürünü cezalandırmadığını göstermek.
- Beklenen çıktı:
  - Skor: 85+
  - Ana mesaj: "İyi görünüyor. Yine de fiyatı kontrol edin."
  - Analiz kartları: yeşil tik ağırlıklı.
- Demo cümlesi:
  - "BiBak sadece risk aramıyor; güven veren ürünleri de anlaşılır şekilde işaretliyor."

### Senaryo B: Az Yorum / Eksik Veri

- Amaç: Veri azsa sistemin gereksiz güven vermediğini göstermek.
- Beklenen çıktı:
  - Yorum metriği: "Yorum yok" veya düşük yorum uyarısı.
  - Yorum kanıtı paneli görünmez.
  - Fiyat geçmişi yoksa: "Fiyat bilgisi yok."
- Demo cümlesi:
  - "BiBak bilmediği şeyi biliyormuş gibi göstermiyor."

### Senaryo C: Şüpheli Yorum veya Fiyat Riski

- Amaç: Juriye asıl koruma değerini göstermek.
- Beklenen çıktı:
  - Skor: 30-69 arası.
  - En az bir amber/kırmızı uyarı.
  - Yorum veya fiyat kartında net aksiyon.
- Demo cümlesi:
  - "Ürün dışarıdan normal görünebilir ama BiBak karar verirken gizli riskleri öne çıkarıyor."

## 4. Sunum Akışı

1. Problem: Kullanıcı yorumlara, indirimlere ve satıcı puanına güvenip güvenemeyeceğini anlayamıyor.
2. Çözüm: BiBak bunu sade bir güven puanı ve kanıt kartlarıyla görünür yapıyor.
3. Demo: Ürün sayfası açılır, juriye "Sizce güvenilir mi?" diye sorulur.
4. BiBak paneli: Skor, öneri, alt puanlar, kanıt kartı ve fiyat bölümü anlatılır.
5. Skor mantığı: Yorum %45, fiyat %30, satıcı %25.
6. İş modeli: Freemium extension, premium alışveriş koruması, B2B marketplace trust API.
7. Kapanış: "BiBak, satın alma anında kullanıcıya sadece puan değil, nedenini de gösteriyor."

## 5. Backup Demo Checklist

Her demo ürünü için şu görseller saklanmalı:

- Ürün sayfası BiBak kapalıyken.
- BiBak açık ve skor alanı görünürken.
- Kanıt kartları görünürken.
- Fiyat bölümü görünürken.
- Hata/az veri durumunun ekran görüntüsü.

Dosya adlandırma:

```text
demo-safe-score.png
demo-safe-evidence.png
demo-low-data-score.png
demo-low-data-price.png
demo-risk-score.png
demo-risk-evidence.png
```

## 6. Kabul Kriterleri

- Teknik olmayan biri 30 saniyede BiBak'in ne yaptığını anlayabiliyor.
- Demo sırasında "bu skor neden çıktı?" sorusuna panel içinden cevap verilebiliyor.
- Veri yoksa UI boş veri mesajı veriyor, tahmin gibi göstermiyor.
- Risk yoksa UI uyarı ikonu göstermiyor.
- Sunumda Econ tarafı problem, kullanıcı değeri, demo anlatımı ve iş modelini sahipleniyor.
