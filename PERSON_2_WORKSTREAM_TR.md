# TrustCart - Person 2 Workstream

## 1. Rol Ozeti

Person 2'nin ana sorumlulugu TrustCart'in urun, kullanici deneyimi, arastirma ve sunum tarafini guclendirmektir.

Backend, ML modeli veya karmasik entegrasyonlarla ugrasmamali. Onun gorevi:

- Kullanicinin anlayacagi aciklamalar yazmak
- Trust Score'un ne anlama geldigini netlestirmek
- Sahte yorum, fake indirim ve riskli satici senaryolari hazirlamak
- Extension popup tasarimini ve metinlerini olusturmak
- Demo akisini gercekci hale getirmek
- Pitch sunumunun problem, kullanici degeri ve is modeli kismini sahiplenmek

Kisaca: Teknik sistemi juriye ve kullaniciya anlamli gelen bir urune donusturmek.

## 2. Gorev Dagilimi

### A. Urun Stratejisi

Netlestirmesi gerekenler:

- TrustCart kim icin?
  - Online alisveris yapan kullanicilar
  - Ogrenciler
  - Aileler
  - Pahali urun almadan once emin olmak isteyenler
- Kullanici problemi ne?
  - "Bu urun gercekten guvenilir mi anlayamiyorum."
- Urun vaadi ne?
  - "TrustCart, urun sayfalarindaki sahte indirimleri, manipule yorumlari ve riskli satici sinyallerini aciklar."

Basit konumlandirma cumlesi:

> TrustCart, online alisveriste urunlerin ne kadar guvenilir oldugunu analiz eden ve bunu anlasilir bir Trust Score ile aciklayan bir browser extension'dir.

### B. Dolandiricilik ve Manipulasyon Arastirmasi

Arastirmasi gereken basliklar:

- Sahte indirimler
  - Sisirilmis eski fiyat
  - Surekli devam eden "kampanya"
  - Gercekci olmayan yuzde indirim
- Yorum manipulasyonu
  - Birbirine cok benzeyen yorumlar
  - Kisa surede gelen cok sayida yorum
  - Asiri genel 5 yildizli yorumlar
  - Yapay veya tesvikli yorumlar
- Riskli satici davranislari
  - Yeni satici ama cok yuksek puan
  - Az yorumla cok iddiali satis
  - Belirsiz iade politikasi
  - Tutarsiz satici bilgileri
- Yaniltici guven sinyalleri
  - "Son 2 urun kaldi"
  - Geri sayim sayaclari
  - Abartili rozetler
  - Kanitsiz "cok satan" etiketi

Hazirlanacak tablo:

| Pattern | Neden Riskli | TrustCart Sinyali | Kullaniciya Aciklama |
|---|---|---|---|
| Benzer yorumlar | Kopya veya AI yorum olabilir | Yorumlar semantik olarak cok yakin | "Bircok yorum benzer ifadeler iceriyor." |
| Yorum patlamasi | Koordineli yorum ihtimali olabilir | Kisa zamanda cok sayida yorum gelmesi | "Yorumlar dogal olmayan bir zaman araliginda yogunlasmis." |
| Fake indirim | Indirim oldugundan buyuk gorunebilir | Eski fiyat piyasa ortalamasindan yuksek | "Eski fiyat sisirilmis olabilir." |
| Riskli satici | Satici guvenilirligi belirsiz olabilir | Sinirli gecmis veya tutarsiz bilgiler | "Satici hakkinda yeterli guven sinyali bulunmuyor." |

### C. Skor Mantigi ve Etiketler

Person 2 ML modelini yazmayacak, ancak skorun kullaniciya nasil anlatilacagini belirlemeli.

| Skor | Etiket | Anlam |
|---|---|---|
| 85-100 | Cok Guvenilir | Dusuk risk |
| 70-84 | Guvenilir | Kucuk uyarilar olabilir |
| 50-69 | Karisik Sinyaller | Dikkatli incele |
| 30-49 | Riskli | Birden fazla uyari var |
| 0-29 | Uzak Dur | Guclu manipulasyon sinyalleri var |

Alt baslik etiketleri:

Review Authenticity:

- Guclu
- Buyuk olcude guvenilir
- Karisik
- Supheli
- Cok supheli

Price Integrity:

- Fiyat makul
- Kucuk fiyat riski
- Olasi fake indirim
- Guclu fake indirim sinyali

Seller Reliability:

- Guvenilir satici
- Sinirli satici gecmisi
- Riskli satici
- Yuksek satici riski

### D. Aciklama Kartlari

Bu kisinin en degerli katkilarindan biri teknik ciktilari kullanici diline cevirmek olacak.

Kotu aciklama:

> Isolation Forest anomaly score dusuk cikti.

Iyi aciklama:

> Bazi yorumlar birbirine cok benzer ifadeler iceriyor. Bu durum kopya, tesvikli veya yapay yorum ihtimalini artirabilir.

#### Supheli Yorum Benzerligi

> Birden fazla yorum benzer cumle yapilari ve ifadeler iceriyor. Bu durum yorumlarin dogal kullanici deneyimlerinden degil, koordineli veya yapay kaynaklardan gelmis olabilecegini gosterebilir.

Onerilen aksiyon:

> Satin almadan once son 3 ve 4 yildizli yorumlari inceleyin.

#### Olasi Fake Indirim

> Urunun eski fiyati gercek piyasa fiyatina gore yuksek gorunuyor olabilir. Bu da indirimin oldugundan daha buyuk gosterildigi anlamina gelebilir.

Onerilen aksiyon:

> Benzer urunlerle fiyat karsilastirmasi yapin.

#### Satici Riski

> Saticinin gecmisi sinirli veya guven sinyalleri tutarsiz gorunuyor.

Onerilen aksiyon:

> Iade politikasi, teslimat suresi ve satici yorumlarini kontrol edin.

## 3. Haftalik Plan

### Gun 1-2: Arastirma ve Urun Netligi

- Kullanici problemi netlestirilir
- Hedef kullanicilar belirlenir
- Sahte yorum, fake indirim ve riskli satici pattern'leri arastirilir
- Trust Score araliklari ve risk etiketleri hazirlanir
- Ilk aciklama kartlari yazilir

### Gun 3-4: UX, Icerik ve Demo Senaryolari

- Extension popup yapisi tasarlanir
- Kart basliklari, aciklamalar ve buton metinleri yazilir
- 2-3 demo urun senaryosu hazirlanir:
  - Guvenilir urun
  - Supheli yorumlu urun
  - Fake indirim ve riskli satici senaryosu
- Fake yorum ornekleri ve beklenen TrustCart ciktilari hazirlanir

### Gun 5-6: Sunum ve Urun Hikayesi

- Pitch akisi hazirlanir
- Problem, cozum, demo ve is modeli netlestirilir
- Sunum gorselleri hazirlanir
- Demo script yazilir
- Juri sorularina cevaplar hazirlanir

### Gun 7: Prova ve Polish

- Demo birkac kez prova edilir
- Backup screenshot'lar hazirlanir
- UI metinleri sadelestirilir
- Sunum suresi kontrol edilir
- Person 2 kendi konusacagi bolumu akici sekilde calisir

## 4. UI/UX Sorumluluklari

Person 2 su ekran ve iceriklerden sorumlu olmali.

### Extension Popup

Icerik sirasi:

1. Trust Score
2. Kisa guven etiketi
3. Ana oneri
4. En onemli risk
5. Review Authenticity
6. Price Integrity
7. Seller Reliability
8. Safer Alternatives

Ornek:

```text
Trust Score: 42 / 100
Riskli - Satin almadan once dikkatli inceleyin

Ana risk:
Bircok yorum benzer ifadeler iceriyor.

Review Authenticity: Yuksek Risk
Price Integrity: Orta Risk
Seller Reliability: Orta Risk
```

### Trust Score Bileseni

Belirlemesi gerekenler:

- Skor araliklari
- Renkler
- Etiketler
- Kisa aciklamalar

Onerilen renk sistemi:

- 85-100: yesil
- 70-84: acik yesil
- 50-69: sari
- 30-49: turuncu
- 0-29: kirmizi

### Aciklama Kartlari

Her kartta sunlar olmali:

- Baslik
- Risk seviyesi
- Aciklama
- Kanit
- Onerilen aksiyon

Ornek:

```text
Supheli Yorum Benzerligi
Yuksek risk

12 yorum birbirine cok benzer ifadeler iceriyor. Bu durum yorumlarin dogal olmayabilecegini gosterir.

Oneri:
Satin almadan once dusuk puanli yorumlari kontrol edin.
```

### Loading, Error ve Empty State Metinleri

Loading:

> Urun guven sinyalleri analiz ediliyor...

Urun bulunamadi:

> Analiz icin bir urun sayfasi acin.

Yetersiz veri:

> Bu urun hakkinda sinirli veri bulundu. Skor daha dusuk guvenilirlikte olabilir.

Hata:

> Bu sayfa analiz edilemedi. Lutfen urunu yenileyip tekrar deneyin.

## 5. Arastirma Gorevleri

Odaklanmasi gereken konular:

- Fake review farm'lar
- AI ile uretilmis yorumlar
- Tesvikli yorumlar
- Fake indirimler
- Fiyat sisirme
- Sahte aciliyet mesajlari
- Sahte kitlik mesajlari
- Marketplace rozetleri
- Satici puani manipulasyonu
- Tuketici psikolojisi

Pitch'te ise yarayacak davranissal kavramlar:

- Anchoring effect: Yuksek eski fiyat indirimi daha cazip gosterir.
- Social proof: Yuksek puan ve cok yorum guven yaratir.
- Scarcity bias: "Son urunler" kullaniciyi acele ettirir.
- Loss aversion: Kampanya bitiyor hissi satin almaya zorlar.
- Authority bias: Rozetler ve etiketler guven algisini artirir.

Pitch cumlesi:

> TrustCart, kullanicilarin en savunmasiz oldugu satin alma aninda; sahte sosyal kanit, fake indirim ve aciliyet baskisi gibi manipulasyonlari gorunur hale getirir.

## 6. Demo Hazirligi

Person 2 demo etkisini buyutmekten sorumlu olmali.

Hazirlamasi gereken 3 demo senaryosu:

### Senaryo 1: Guvenilir Urun

- Dogal yorum dagilimi
- Gercekci fiyat
- Guvenilir satici
- Trust Score: 85+

### Senaryo 2: Supheli Yorumlar

- Cok benzer yorumlar
- Kisa surede gelen cok sayida 5 yildiz
- Genel ifadeler
- Trust Score: 40-55

### Senaryo 3: Fake Indirim ve Riskli Satici

- Sisirilmis eski fiyat
- Agresif indirim
- Sinirli satici gecmisi
- Belirsiz iade bilgisi
- Trust Score: 25-40

Demo akisi:

1. Normal gorunen bir urun sayfasi acilir
2. "Bu urune guvenir miydiniz?" diye sorulur
3. TrustCart acilir
4. Dusuk Trust Score gosterilir
5. Sebepler aciklanir:
   - Benzer yorumlar
   - Fake indirim
   - Riskli satici
6. Daha guvenli alternatif gosterilir

En guclu demo ani:

> Urun disaridan guvenilir gorunuyor ama TrustCart yorumlarin yapay ve indirimin yaniltici olabilecegini ortaya cikariyor.

## 7. Pitch Katkisi

Person 2 sunumda ozellikle su bolumleri anlatmali:

- Problem
- Kullanici davranisi
- Manipulasyon ornekleri
- TrustCart'in kullaniciya degeri
- Is modeli ve pazar potansiyeli

Konusma ornegi:

> Online alisveriste kullanicilar yorumlara, puanlara, indirimlere ve satici rozetlerine guvenerek karar veriyor. Ancak bu sinyaller kolayca manipule edilebiliyor. TrustCart, urun sayfasindaki bu gorunmeyen riskleri analiz ederek kullaniciya anlasilir bir Trust Score ve aciklamalar sunuyor.

Vurgulanacak fark:

> Biz sadece fake review tespiti yapmiyoruz. Urun sayfasinin genel guvenilirligini; yorum, fiyat ve satici sinyallerini birlikte degerlendirerek acikliyoruz.

Is modeli fikirleri:

- Freemium browser extension
- Premium alisveris koruma paketi
- Marketplace'ler icin B2B trust API
- Tuketici koruma veya fraud intelligence cozumu
- Affiliate model, ancak guven skoru ile uyumlu olmali

## 8. Yuksek Etkili, Dusuk Teknik Gorevler

Person 2 icin en uygun gorevler:

1. Aciklama kartlari yazmak
2. Fake yorum ornekleri hazirlamak
3. Demo urun senaryolari olusturmak
4. Trust Score etiketlerini belirlemek
5. UI metinlerini yazmak
6. Popup wireframe hazirlamak
7. Pitch deck akisini olusturmak
8. Juri Q&A dokumani hazirlamak
9. Backup screenshot toplamak
10. Safer alternatives mock icerikleri yazmak
11. Tuketici psikolojisi kismini sunuma eklemek
12. Urun konumlandirmasini netlestirmek
13. Basit React/Tailwind kart bilesenleri yapmak
14. Demo script yazmak

## 9. Zaman Kaybetmemesi Gereken Seyler

Person 2 sunlarla ugrasmamali:

- ML modeli egitmek
- Isolation Forest parametresi ayarlamak
- sentence-transformers pipeline yazmak
- Backend mimarisi
- Database tasarimi
- Scraper altyapisi
- Karmasik API entegrasyonlari
- Auth sistemi
- Odeme sistemi
- Akademik makalelere asiri gomulmek
- Uzun dokumantasyon yazmak
- Full landing page yapmak
- Cok fazla persona uretmek
- Gercek fiyat gecmisi altyapisi kurmak
- Cok fazla ozellik eklemeye calismak

Hackathon icin hedef:

> Az ozellik, guclu demo, net deger onerisi.

## 10. Oncelik Sirasi

En onemli isler:

1. Demo senaryolarini hazirlamak
2. Aciklama kartlarini yazmak
3. Trust Score araliklarini ve etiketlerini netlestirmek
4. Extension popup akisini tasarlamak
5. Pitch hikayesini hazirlamak
6. Fraud pattern arastirmasi yapmak
7. Safer alternatives icerigini hazirlamak
8. UI microcopy yazmak
9. Juri sorularina cevap hazirlamak
10. Backup demo gorsellerini hazirlamak

En kritik dusunce:

> Person 2'nin gorevi TrustCart'i teknik bir projeden cikarip, juriye "bu gercek bir urun olabilir" dedirten hale getirmektir.
