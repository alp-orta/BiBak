# BiBak

BiBak, e-ticaret kullanıcılarının satın alma kararını daha güvenli ve hızlı vermesine yardımcı olan yapay zeka destekli bir Chrome eklentisi ve lokal Flask API projesidir.

Kullanıcı desteklenen bir ürün sayfasına girdiğinde BiBak; ürün yorumlarını, satıcı bilgilerini, fiyat sinyallerini ve ürün sayfasındaki güven göstergelerini analiz eder. Sonuçları sade bir panelde güven skoru, risk uyarıları, fiyat değerlendirmesi, satıcı analizi ve kısa açıklamalar olarak gösterir.

## Ürün Özeti

Online alışverişte kullanıcıların en büyük problemlerinden biri, yüzlerce yorumun ve satıcı bilgisinin arasından güvenilir bir karar çıkarmaktır. Sahte yorumlar, düşük kaliteli satıcılar, yanıltıcı fiyat hareketleri ve eksik ürün bilgileri satın alma riskini artırır.

BiBak bu süreci otomatikleştirir. Chrome eklentisi ürün sayfasından herkese açık verileri toplar, backend API bu verileri analiz eder ve kullanıcıya anlaşılır bir güven değerlendirmesi sunar. Amaç, kullanıcının ürünü satın almadan önce "bu ürün güvenilir mi, fiyat mantıklı mı, satıcı riskli mi?" sorularına hızlı cevap vermektir.

## Temel Özellikler

- Desteklenen ürün sayfalarında otomatik açılan Chrome eklentisi paneli.
- Ürün yorumları üzerinden güven ve risk analizi.
- Satıcı, fiyat ve ürün kimliği sinyallerine göre ek değerlendirme.
- Türkçe ve İngilizce arayüz desteği.
- Lokal API ile hızlı demo ve geliştirme kurulumu.
- Chrome Web Store hazır olana kadar manuel yükleme için zip paketi.

## Teknik Mimari

BiBak iki ana parçadan oluşur: Chrome eklentisi ve lokal analiz API'si. Chrome eklentisi ürün sayfasında çalışır, sayfadaki ürün başlığı, fiyat, satıcı, puan, yorumlar ve platforma özel metadata alanlarını çıkarır. Bu veri backend API'ye gönderilir ve API tarafında yorum analizi, satıcı değerlendirmesi, fiyat sinyali analizi ve güven skoru üretimi yapılır.

Extension tarafında platforma özel scraper modülleri bulunur. Amazon, Trendyol ve Hepsiburada sayfalarının DOM yapıları farklı olduğu için her platform için ayrı veri çıkarım mantığı kullanılır. Çıkarılan veriler ortak bir ürün şemasına normalize edilir ve analiz API'sine standart bir contract ile gönderilir.

Backend tarafında Flask API, gelen ürün verisini doğrular ve analiz pipeline'ına aktarır. Pipeline; yorumlardan risk sinyalleri çıkarır, satıcı ve fiyat metadata'sını değerlendirir, ürün kimliği ve geçmiş gözlem sinyallerini kullanır, ardından kullanıcıya gösterilecek güven skoru, açıklamalar, uyarılar ve aksiyon önerileri üretir.

## Kullanılan Teknolojiler

- **Chrome MV3 Extension**: Tarayıcı eklentisi olarak ürün sayfalarına panel enjekte etmek için.
- **Plasmo**: Chrome eklentisinin geliştirme, build ve manifest üretim süreci için.
- **React**: Eklenti içindeki BiBak analiz paneli arayüzü için.
- **TypeScript**: Extension kodunda tip güvenliği ve daha sürdürülebilir scraper/API contract yapısı için.
- **Lucide React**: Panel ve extension ikonlarında tutarlı ikon sistemi için.
- **Flask**: Lokal analiz API'sini sunmak için.
- **Python**: Backend analiz pipeline'ı, yorum/satıcı/fiyat değerlendirme modülleri ve testler için.
- **SQLite**: Lokal geliştirme sırasında metadata seviyesinde ürün, satıcı ve fiyat gözlemlerini saklamak için.
- **unittest**: Backend API ve analiz servislerini doğrulamak için.
- **npm / Node.js**: Extension bağımlılıkları, typecheck ve production build süreci için.

## Desteklenen Platformlar

- Amazon ürün sayfaları
- Trendyol ürün sayfaları
- Hepsiburada ürün sayfaları

## Proje Yapısı

- `BiBak-extension/`: Plasmo tabanlı Chrome MV3 eklentisi.
- `BiBak-api/`: Flask tabanlı analiz API'si.
- `website/`: Statik tanıtım sitesi ve lokal eklenti zip paketi.
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

### 3. Eklentiyi Geliştirme Modunda Çalıştır

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

`.env` içinde `PLASMO_PUBLIC_API_BASE_URL` değeri farklı bir API adresine yönlendirilebilir. Varsayılan değer `http://127.0.0.1:8000` şeklindedir.

## Chrome'a Manuel Kurulum

Chrome Web Store yayını hazır olana kadar eklenti lokal zip paketiyle kurulabilir.

### Hazır Zip ile Kurulum

1. `website/downloads/bibak-extension-local.zip` dosyasını aç.
2. Chrome'da `chrome://extensions` adresine git.
3. Sağ üstten `Developer mode` seçeneğini aç.
4. `Load unpacked` butonuna tıkla.
5. Zip'ten çıkardığın `chrome-mv3-prod` klasörünü seç.
6. API'nin çalıştığından emin ol: `http://127.0.0.1:8000`.
7. Desteklenen bir Amazon, Trendyol veya Hepsiburada ürün sayfasını aç.

### Zip Paketini Yeniden Üretme

```bash
cd BiBak-extension
npm install
npm run build
cd build
zip -r ../../website/downloads/bibak-extension-local.zip chrome-mv3-prod
```

## Website Lokal Önizleme

```bash
cd website
python3 -m http.server 5174
```

Tarayıcıda `http://localhost:5174` adresini aç.

## Doğrulama

Backend testleri:

```bash
cd BiBak-api
./venv/bin/python -m unittest discover -s tests
./venv/bin/python test_integration.py
```

Extension kontrolleri:

```bash
cd BiBak-extension
npm run typecheck
npm run build
```
