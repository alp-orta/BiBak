# BiBak — Page Scraper Implementation Prompt

You are a senior frontend engineer working on BiBak, an AI-powered Chrome extension that detects fake reviews on e-commerce sites.

## CONTEXT — What Already Exists

### Backend (Flask API — fully working)
- `POST /analyze-product` on port `8000`
- Accepts:
```json
{
  "title": "Product Name",
  "price": "1299 TL",
  "seller": "Seller Name",
  "reviews": ["review 1", "review 2", ...],
  "rating": 4.3,
  "locale": "tr"
}
```
- Returns real ML analysis (sentence-transformer embeddings, DBSCAN clustering, IsolationForest anomaly detection):
```json
{
  "trust_score": 82,
  "review_authenticity_score": 82,
  "price_integrity_score": 98,
  "seller_reliability_score": 93,
  "risk_flags": ["Anormal yorum benzerliği tespit edildi"],
  "explanations": ["9 reviews show near-identical semantic structure", ...],
  "safer_alternatives": [],
  "review_analysis": {
    "fraud_score": 18,
    "suspicious_clusters": 0,
    "cluster_data": [],
    "review_scores": [{"index": 0, "fraud_score": 5, "anomaly_score": 0.12, "cluster_id": -1, "flags": []}]
  }
}
```

### Extension (Plasmo framework — UI exists, scraping does NOT)
- Framework: Plasmo (Chrome MV3)
- UI: React + Framer Motion + Inline styles (Shadow DOM)
- `contents/sidebar.tsx` — Content script, injects sidebar overlay on matched pages
- `components/TrustSidebar.tsx` — Main UI component (glassmorphic dark design, 13KB, fully styled)
- `api/client.ts` — API client with `analyzeProduct()` function, already typed
- `i18n/translations.ts` — TR/EN i18n support

### Current `sidebar.tsx` matches:
```typescript
matches: [
  "https://*.amazon.com/*",
  "https://*.amazon.com.tr/*",
  "https://*.trendyol.com/*",
  "https://*.hepsiburada.com/*"
]
```

### Current `api/client.ts` interface:
```typescript
export interface ProductData {
  title: string
  price: string
  seller: string
  reviews: string[]
  rating: number
  locale?: string
}
```

---

## YOUR TASK — Build Page Scrapers

### Phase 1: Trendyol Scraper (Priority)

Create `scrapers/trendyol.ts` that extracts from a Trendyol product page:

1. **Product title** — from the product name heading
2. **Price** — current price (handle discounted/original price display)
3. **Seller name** — from the seller info section
4. **Rating** — star rating as a float
5. **Reviews** — scrape ALL visible review texts from the reviews section

Key Trendyol DOM patterns to target:
- Product title: `.pr-new-br span`, `h1.pr-new-br`
- Price: `.prc-dsc`, `.prc-org` (discounted vs original)
- Seller: `.merchant-text`, `a.seller-name-text`
- Rating: `.tltp-avg`, `.rating-score`
- Reviews: `.comment-text p`, `.rvw-cnt p`

**Important considerations:**
- Trendyol lazy-loads reviews — you may need to scroll or paginate
- Reviews tab might need a click to activate
- Handle Turkish characters properly (UTF-8)
- Some selectors may change — implement fallback selectors
- Add a retry/wait mechanism for dynamically loaded content

### Phase 2: Hepsiburada Scraper

Create `scrapers/hepsiburada.ts` with similar extraction:
- Product title: `h1.product-name`, `#product-name`
- Price: `.product-price`, `span[data-bind="markupText"]`
- Seller: `.merchant-box-wrapper .merchant-name`
- Rating: `.ratings .rating-score`
- Reviews: `.hermes-ReviewCard-module-comment p`

### Phase 3: Amazon Scraper

Create `scrapers/amazon.ts`:
- Product title: `#productTitle`
- Price: `.a-price .a-offscreen`, `#priceblock_ourprice`
- Seller: `#sellerProfileTriggerId`, `#merchant-info`
- Rating: `#acrPopover span.a-size-base`, `.a-icon-star`
- Reviews: `div.review-text-content span`, `.review-text`

### Architecture

```
BiBak-extension/
  scrapers/
    index.ts          # Auto-detects site and delegates to correct scraper
    trendyol.ts       # Trendyol-specific extraction
    hepsiburada.ts    # Hepsiburada-specific extraction
    amazon.ts         # Amazon extraction
    utils.ts          # Shared helpers (waitForElement, retrySelector, etc.)
  contents/
    sidebar.tsx       # UPDATE: call scraper on mount, pass data to TrustSidebar
  components/
    TrustSidebar.tsx  # UPDATE: accept scraped data as props, show loading state
  api/
    client.ts         # Already exists, no changes needed
```

### Scraper Interface

Each scraper should implement:
```typescript
export interface ScrapedProduct {
  title: string
  price: string
  seller: string
  reviews: string[]
  rating: number
  platform: "trendyol" | "hepsiburada" | "amazon"
}

export interface Scraper {
  canHandle(url: string): boolean
  scrape(): Promise<ScrapedProduct>
}
```

### Utility Functions Needed in `utils.ts`:
```typescript
waitForElement(selector: string, timeout?: number): Promise<Element | null>
queryAll(selectors: string[]): Element | null  // tries multiple selectors
extractText(el: Element | null): string
extractNumber(text: string): number
scrollToLoadReviews(): Promise<void>
```

### Integration with `sidebar.tsx`:

```typescript
// On mount:
// 1. Detect which platform we're on
// 2. Run the appropriate scraper
// 3. Call analyzeProduct() with scraped data
// 4. Pass results to TrustSidebar
```

### Code Quality Rules:
- TypeScript strict mode
- No `any` types
- Handle all edge cases (missing elements, empty reviews, page not fully loaded)
- Implement proper error states (show "couldn't extract data" in UI if scraping fails)
- Keep selectors in a config object at the top of each scraper for easy updates
- Add console.log with `[BiBak]` prefix for debugging

### DO NOT:
- Modify the backend
- Rewrite TrustSidebar from scratch (only add props/loading state)
- Use external scraping libraries
- Break the existing Shadow DOM styling

Start with Trendyol scraper, test it, then expand to other platforms.
