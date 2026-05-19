# BiBak - Yapay Zeka Destekli Alışveriş Güven Asistanı

BiBak, e-ticaret ürün sayfalarını analiz eden yapay zeka destekli bir Chrome eklentisidir. Yorumları, satıcı bilgilerini, fiyat sinyallerini ve ürün metadata'sını değerlendirerek kullanıcıya tek ekranda güven skoru, risk uyarıları ve satın alma yorumu sunar.

Amaç basit: Kullanıcı yüzlerce yorumu okumadan "bu ürün güvenilir mi, yorumlar doğal mı, satıcı riskli mi, fiyat mantıklı mı?" sorularına hızlı cevap alır.

## Neden BiBak?

- Sahte veya birbirine çok benzeyen yorumları yakalamaya yardımcı olur.
- Satıcı, fiyat ve yorum sinyallerini birlikte değerlendirir.
- Kullanıcıların analizlerinden anonim ve toplu bir fiyat geçmişi oluşturur.
- Sonucu sade bir Chrome panelinde açıklar.
- Türkçe ve İngilizce arayüz sunar.
- Amazon, Trendyol ve Hepsiburada ürün sayfalarında çalışır.

## AI/ML Yaklaşımı

BiBak sadece anahtar kelime kontrolü yapmaz; yorumları ve ürün sinyallerini hibrit bir AI/ML pipeline ile analiz eder.

- `sentence-transformers` ile yorumlardan semantic embedding üretilir.
- `DBSCAN` ve cosine similarity ile birbirine çok benzeyen yorum kümeleri bulunur.
- `IsolationForest` ile istatistiksel olarak şüpheli yorumlar tespit edilir.
- Yorum güvenilirliği, fiyat bütünlüğü ve satıcı güvenilirliği ayrı ayrı skorlanır.
- Bu skorlar birleştirilerek nihai `Trust Score` oluşturulur.
- Skorların yanında kullanıcıya kısa ve anlaşılır açıklamalar gösterilir.

## Teknik Mimari

- **Chrome Extension**: Ürün sayfasına BiBak panelini enjekte eder.
- **Scraper Katmanı**: Amazon, Trendyol ve Hepsiburada'dan ürün, fiyat, satıcı ve yorum verilerini çıkarır.
- **Flask API**: Extension'dan gelen veriyi analiz pipeline'ına gönderir.
- **ML Pipeline**: Yorum benzerliği, anomali tespiti, fiyat/satıcı sinyalleri ve güven skorunu hesaplar.
- **Toplu Fiyat Geçmişi**: Kullanıcı analizlerinden gelen ürün ve fiyat gözlemlerini anonim metadata olarak saklar; böylece zamanla daha güçlü fiyat karşılaştırması yapılabilir.
- **React UI**: Sonuçları kullanıcı dostu bir panelde gösterir.

## Kullanılan Teknolojiler

- Chrome MV3 Extension
- Plasmo
- React
- TypeScript
- Flask
- Python
- sentence-transformers
- PyTorch CPU
- scikit-learn
- NumPy / pandas
- SQLite

## Proje Yapısı

- `BiBak-extension/`: Plasmo tabanlı Chrome eklentisi.
- `BiBak-api/`: Flask analiz API'si.
- `website/`: Tanıtım sitesi ve lokal extension zip paketi.
- `shared/`: Demo ve ortak veri dosyaları.

## Canlı Website

BiBak tanıtım sitesi ve lokal extension indirme sayfası:

https://bibakapp.netlify.app/

## Lokal Kurulum

### 1. API'yi Başlat

```bash
git clone https://github.com/alp-orta/BiBak.git
cd BiBak
cd BiBak-api
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python main.py
```

API varsayılan olarak `http://127.0.0.1:8000` üzerinde çalışır.

### 2. Chrome Extension'ı Kur

Chrome Web Store hazır olana kadar extension zip paketiyle manuel kurulabilir.

1. Canlı siteden extension zip dosyasını indir: https://bibakapp.netlify.app/
2. Zip dosyasını aç.
3. Chrome'da `chrome://extensions` adresine git.
4. `Developer mode` seçeneğini aç.
5. `Load unpacked` butonuna tıkla.
6. Zip'ten çıkan `chrome-mv3-prod` klasörünü seç.
7. API'nin çalıştığından emin ol: `http://127.0.0.1:8000`.
8. Desteklenen bir Amazon, Trendyol veya Hepsiburada ürün sayfasını aç.
