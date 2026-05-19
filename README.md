# BiBak - AI-Powered Shopping Trust Assistant

BiBak, e-ticaret ürün sayfalarını analiz eden yapay zeka destekli bir Chrome eklentisidir. Yorumları, satıcı bilgilerini, fiyat sinyallerini ve ürün metadata'sını değerlendirerek kullanıcıya tek ekranda güven skoru, risk uyarıları ve satın alma yorumu sunar.

Amaç basit: Kullanıcı yüzlerce yorumu okumadan "bu ürün güvenilir mi, yorumlar doğal mı, satıcı riskli mi, fiyat mantıklı mı?" sorularına hızlı cevap alır.

## Neden BiBak?

- Sahte veya birbirine çok benzeyen yorumları yakalamaya yardımcı olur.
- Satıcı, fiyat ve yorum sinyallerini birlikte değerlendirir.
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

## Lokal Kurulum

### 1. Repoyu İndir

```bash
git clone https://github.com/alp-orta/BiBak.git
cd BiBak
```

### 2. API'yi Başlat

```bash
cd BiBak-api
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python main.py
```

API varsayılan olarak `http://127.0.0.1:8000` üzerinde çalışır.

### 3. Extension'ı Çalıştır

Yeni bir terminalde:

```bash
cd BiBak-extension
npm install
npm run dev
```

İsteğe bağlı API adresi ayarı:

```bash
cp .env.example .env
```

## Chrome'a Manuel Kurulum

Chrome Web Store hazır olana kadar zip paketiyle manuel kurulum yapılabilir.

1. `website/downloads/bibak-extension-local.zip` dosyasını aç.
2. Chrome'da `chrome://extensions` adresine git.
3. `Developer mode` seçeneğini aç.
4. `Load unpacked` butonuna tıkla.
5. Zip'ten çıkan `chrome-mv3-prod` klasörünü seç.
6. API'nin çalıştığından emin ol: `http://127.0.0.1:8000`.

## Zip Paketini Yeniden Üretme

```bash
cd BiBak-extension
npm install
npm run build
cd build
zip -r ../../website/downloads/bibak-extension-local.zip chrome-mv3-prod
```

## Website Önizleme

```bash
cd website
python3 -m http.server 5174
```

Tarayıcıda `http://localhost:5174` adresini aç.

## Doğrulama

```bash
cd BiBak-api
./venv/bin/python -m unittest discover -s tests
./venv/bin/python test_integration.py

cd ../BiBak-extension
npm run typecheck
npm run build
```
