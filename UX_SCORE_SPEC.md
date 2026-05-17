# BiBak UX and Score Spec

## Extension'da Ne Gozukmeli?

BiBak sidebar kullanicinin karar aninda hizli cevap vermeli: "Bu urune guvenebilir miyim, neden, ne yapmaliyim?"

Onerilen ekran sirasi:

1. **Toplam Trust Score**
   - 0-100 arasi ana puan.
   - Renk ve etiket ayni anda gorunur.
   - Kullanici puani tek basina degil, hemen altindaki oneriyle okumali.

2. **Kisa Oneri**
   - Ornek: "Riskli gorunuyor; satin almadan once alternatifleri inceleyin."
   - Bu alan teknik skorun kullanici aksiyonuna cevrildigi yerdir.

3. **Alt Puanlar**
   - Yorum Guvenilirligi
   - Fiyat Tutarliligi
   - Satici Guvenilirligi

4. **Puan Nasil Olustu?**
   - Yorum Guvenilirligi: %45
   - Fiyat Tutarliligi: %30
   - Satici Guvenilirligi: %25

5. **Yorum Kaniti**
   - Benzer yorum grubu sayisi.
   - Yuksek riskli yorum sayisi.
   - Varsa 1-2 kisa supheli yorum ornegi.

6. **Fiyat ve Zamanlama**
   - Guncel fiyat.
   - Gecmis en dusuk, en yuksek, ortalama.
   - Fake indirim veya fiyat sisirme sinyali.

7. **Risk Uyarilari**
   - En onemli riskler kisa kartlar halinde.
   - Her risk "ne oldu?" ve "neden onemli?" dilinde yazilmali.

8. **Daha Guvenli Alternatifler**
   - Sadece yeterince benzer urunler gosterilmeli.
   - Her alternatifte neden daha guvenli oldugu belirtilmeli.

## Toplam Puan Formulu

MVP icin kullaniciya anlatilabilir sade formel:

```text
Trust Score =
  Yorum Guvenilirligi x 0.45
+ Fiyat Tutarliligi x 0.30
+ Satici Guvenilirligi x 0.25
- Kanit Kalitesi Cezalari
```

Kanit kalitesi cezalari su durumlarda uygulanir:

- Yorumlarin onemli kismi sadece kargo/paketleme anlatiyorsa.
- Yorumlar urun kullanilmadan yazilmissa.
- Detayli kullanim yorumu azsa.
- Negatif sonuc bildiren yorumlar belirginse.
- Sayfadan cekilen veri dusuk guvenliyse.

Bu sayede toplam puan yalnizca "ortalama" degil, kanitin kalitesini de dikkate alan bir karar puani olur.

## Skor Etiketleri

| Skor | Etiket | Kullanici Mesaji |
|---|---|---|
| 85-100 | Cok Guvenilir | Guven sinyalleri guclu. |
| 70-84 | Guvenilir | Genel olarak iyi, kucuk uyarilari oku. |
| 50-69 | Karisik Sinyaller | Satin almadan once yorum ve fiyat gecmisini karsilastir. |
| 30-49 | Riskli | Alternatiflere bakmadan karar verme. |
| 0-29 | Uzak Dur | Guclu manipulasyon veya belirsizlik sinyalleri var. |

## Fake Yorum Kullaniciya Nasil Gosterilmeli?

Kullaniciya "model soyle dedi" denmemeli. Kanit dili kullanilmali:

```text
Yorum Kaniti
2 benzer yorum grubu bulundu.
8 yorum yuksek riskli gorunuyor.

"Harika urun cok begendim tavsiye ederim..."
"Cok kaliteli herkese tavsiye ederim..."

Oneri:
Satin almadan once 3 ve 4 yildizli yorumlari, uzun kullanim deneyimlerini ve negatif yorumlari kontrol edin.
```

Ana prensip: Kullaniciya su anlatilmali:

- Hangi sinyal supheli?
- Bu sinyal satin alma kararini neden etkiler?
- Kullanici simdi ne yapmali?

## Fiyat Hilesi Kullaniciya Nasil Gosterilmeli?

Fiyat tarafinda kullaniciya sadece "riskli" demek yetmez. Gecmisle karsilastirma gorunmeli:

```text
Fiyat ve Zamanlama
Guncel fiyat: 899 TL
Gecmis ortalama: 760 TL
Gecmis en dusuk: 699 TL

Sinyal:
Guncel fiyat gecmis ortalamanin uzerinde. Indirim iddiasi zayif olabilir.

Oneri:
Benzer urunlerle karsilastir veya fiyat dususunu bekle.
```

Fake indirim senaryosunda en iyi mesaj:

```text
Yakin gecmiste fiyat artisi sonrasi normale donus var. Bu, indirimin oldugundan daha buyuk gosterildigini dusundurebilir.
```

## Demo Icin En Iyi Akis

1. Disaridan guvenilir gorunen urun acilir.
2. Juriye "Bu urune guvenir miydiniz?" diye sorulur.
3. BiBak sidebar acilir.
4. Toplam puan ve oneri gosterilir.
5. Once fake yorum kaniti, sonra fiyat sinyali anlatilir.
6. Daha guvenli alternatif veya bekleme onerisiyle demo bitirilir.

En guclu anlatim:

> BiBak, kullanicinin satin alma aninda goremedigi manipule yorum, fake indirim ve satici risklerini sade bir Trust Score ve kanit kartlariyla gorunur hale getirir.
