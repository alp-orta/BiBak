import {
  ScrapedProduct,
  Scraper,
  type MissingProductField,
  type ScrapedReviewDetail,
  type ScrapeMetadata,
  type ScrapeSource,
  type ScrapeWarning,
  type SellerMetadata
} from "./index";
import { extractNumber, extractText, queryAll, waitForElement } from "./utils";

const SELECTORS = {
  title: [
    "h1[data-test-id='title']",
    "h1[data-testid='title']",
    "[data-test-id='product-title']",
    "[data-testid='product-title']",
    "h1.product-name",
    "#product-name",
    "h1",
    "meta[property='og:title']"
  ],
  price: [
    "[data-test-id='price-current-price']",
    "[data-testid='price-current-price']",
    "[data-test-id='default-price']",
    "[data-testid='default-price']",
    "[data-test-id='price']",
    "[data-testid='price']",
    "[data-test-id*='price']",
    "[data-testid*='price']",
    "#offering-price",
    ".product-price",
    ".price",
    "[class*='Price']",
    "[class*='price']",
    "meta[property='product:price:amount']",
    "meta[itemprop='price']"
  ],
  seller: [
    "[data-test-id='merchant-name']",
    "[data-testid='merchant-name']",
    "[data-test-id='seller-name']",
    "[data-testid='seller-name']",
    "[data-test-id*='merchant'] a",
    "[data-testid*='merchant'] a",
    "[data-test-id*='seller'] a",
    "[data-testid*='seller'] a",
    ".merchant-box-wrapper .merchant-name",
    ".merchant-name",
    ".seller-name",
    "a[href*='/magaza/']"
  ],
  rating: [
    "[data-test-id='rating-score']",
    "[data-testid='rating-score']",
    "[data-test-id*='rating']",
    "[data-testid*='rating']",
    ".ratings .rating-score",
    ".rating-score",
    "[class*='Rating']",
    "[class*='rating']"
  ],
  reviews: [
    "[data-test-id*='review'] [data-test-id*='comment']",
    "[data-testid*='review'] [data-testid*='comment']",
    "[data-test-id*='review'] p",
    "[data-testid*='review'] p",
    ".hermes-ReviewCard-module-comment p",
    ".hermes-ReviewCard-module-comment",
    "[class*='ReviewCard'] [class*='comment']",
    "[class*='ReviewCard'] p",
    "[class*='review'] [class*='comment']",
    ".review-text"
  ]
};

const PRICE_PATTERN = /(?:₺\s*[\d.]+(?:,\d{2})?|[\d.]+(?:,\d{2})?\s*(?:TL|₺))/i;
const LOW_REVIEW_COUNT_THRESHOLD = 5;

type ProductStructuredData = {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  sku?: string;
  productID?: string;
  brand?: {
    name?: string;
  } | string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    seller?: {
      name?: string;
    };
  } | Array<{
    price?: string | number;
    priceCurrency?: string;
    seller?: {
      name?: string;
    };
  }>;
  aggregateRating?: {
    ratingValue?: string | number;
    reviewCount?: string | number;
    ratingCount?: string | number;
  };
  review?: Array<{
    reviewBody?: string;
    name?: string;
    datePublished?: string;
    reviewRating?: {
      ratingValue?: string | number;
    };
  }>;
};

type TextCandidate = {
  text: string;
  selector: string;
};

type PriceExtraction = {
  text: string;
  value: number | null;
  selector: string;
};

type HepsiburadaMerchantState = {
  name?: string;
  id?: string;
  urlPostfix?: string;
  labelName?: string;
  lifetimeRating?: number;
  ratingQuantity?: number;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeReviewKey(value: string): string {
  return normalizeText(value).toLocaleLowerCase("tr-TR");
}

function getMetaContent(selector: string): string {
  return document.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
}

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parsePriceValue(value: string): number | null {
  const number = value.replace(/[^\d.,]/g, "");
  if (!number) {
    return null;
  }

  const normalized = number.includes(",")
    ? number.replace(/\./g, "").replace(",", ".")
    : number.split(".").length > 1 && number.split(".").at(-1)?.length === 3
      ? number.replace(/\./g, "")
      : number;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: string | number | undefined, currency = "TRY"): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  if (currency === "TRY" || currency === "TL") {
    return `${new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numeric)} TL`;
  }

  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(numeric);
}

function isVisibleElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getVisibleCandidates(selectors: string[], root: ParentNode = document): TextCandidate[] {
  const seen = new Set<string>();
  const candidates: TextCandidate[] = [];

  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((element) => {
      if (element instanceof HTMLMetaElement) {
        const content = element.content?.trim();
        if (content && !seen.has(`${selector}:${content}`)) {
          seen.add(`${selector}:${content}`);
          candidates.push({ text: content, selector });
        }
        return;
      }

      if (!isVisibleElement(element)) {
        return;
      }

      const text = normalizeText(extractText(element));
      const key = `${selector}:${text}`;
      if (text && !seen.has(key)) {
        seen.add(key);
        candidates.push({ text, selector });
      }
    });
  }

  return candidates;
}

function getStructuredProductData(root: ParentNode = document): ProductStructuredData | null {
  const scripts = Array.from(root.querySelectorAll("script[type='application/ld+json']"));

  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;

    const parsed = parseJsonSafely<unknown>(raw);
    if (!parsed) continue;

    const entries = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed && Array.isArray((parsed as Record<string, unknown>)["@graph"])
        ? ((parsed as Record<string, unknown>)["@graph"] as unknown[])
        : [parsed];

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const type = record["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((item) => item === "Product")) {
        return record as ProductStructuredData;
      }
    }
  }

  return null;
}

function collectJsonPayloads(): unknown[] {
  const payloads: unknown[] = [];

  document.querySelectorAll("script[type='application/json'], script[type='application/ld+json']").forEach((script) => {
    const parsed = parseJsonSafely<unknown>(script.textContent?.trim() ?? "");
    if (parsed) {
      payloads.push(parsed);
    }
  });

  for (const script of Array.from(document.scripts)) {
    const text = script.textContent?.trim() ?? "";
    if (!text || text.length > 2_500_000) {
      continue;
    }

    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      const parsed = parseJsonSafely<unknown>(text);
      if (parsed) {
        payloads.push(parsed);
      }
    }
  }

  return payloads;
}

function getReduxStorePayload(): unknown | null {
  const raw = document.querySelector("#reduxStore")?.textContent?.trim();
  return raw ? parseJsonSafely<unknown>(raw) : null;
}

function walkPayload(payload: unknown, visit: (record: Record<string, unknown>) => void, seen = new Set<unknown>()): void {
  if (!payload || typeof payload !== "object" || seen.has(payload)) {
    return;
  }
  seen.add(payload);

  if (Array.isArray(payload)) {
    payload.forEach((entry) => walkPayload(entry, visit, seen));
    return;
  }

  const record = payload as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((value) => walkPayload(value, visit, seen));
}

function getStringByKeys(keys: string[]): string {
  const normalizedKeys = new Set(keys.map((key) => key.toLocaleLowerCase("en-US")));

  for (const payload of collectJsonPayloads()) {
    let found = "";
    walkPayload(payload, (record) => {
      if (found) return;
      for (const [key, value] of Object.entries(record)) {
        if (normalizedKeys.has(key.toLocaleLowerCase("en-US")) && typeof value === "string" && value.trim()) {
          found = value.trim();
          return;
        }
      }
    });
    if (found) {
      return normalizeText(found);
    }
  }

  return "";
}

function getNumberByKeys(keys: string[]): number | undefined {
  const normalizedKeys = new Set(keys.map((key) => key.toLocaleLowerCase("en-US")));

  for (const payload of collectJsonPayloads()) {
    let found: number | undefined;
    walkPayload(payload, (record) => {
      if (found !== undefined) return;
      for (const [key, value] of Object.entries(record)) {
        if (!normalizedKeys.has(key.toLocaleLowerCase("en-US"))) {
          continue;
        }

        const parsed = typeof value === "number" ? value : typeof value === "string" ? extractNumber(value) : 0;
        if (Number.isFinite(parsed) && parsed > 0) {
          found = parsed;
          return;
        }
      }
    });
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function extractProductIdFromUrl(url: string): string | null {
  return url.match(/-p-([A-Za-z0-9]+)/i)?.[1] ?? null;
}

function cleanTitle(title: string): string {
  return normalizeText(title)
    .replace(/\s+Fiyatı\s*(?:-|$).*$/i, "")
    .replace(/\s*-\s*Hepsiburada$/i, "")
    .trim();
}

function extractTitle(): string {
  const structured = getStructuredProductData();
  if (structured?.name) {
    return cleanTitle(structured.name);
  }

  const title = normalizeText(extractText(queryAll(SELECTORS.title)));
  if (title) {
    return cleanTitle(title);
  }

  const metaTitle = getMetaContent("meta[property='og:title']") || getMetaContent("meta[name='twitter:title']");
  if (metaTitle) {
    return cleanTitle(metaTitle);
  }

  const scriptTitle = getStringByKeys(["name", "productName", "title"]);
  if (scriptTitle) {
    return cleanTitle(scriptTitle);
  }

  return cleanTitle(document.title || "");
}

function isPromotionalPriceText(text: string): boolean {
  const normalized = text.toLocaleLowerCase("tr-TR");
  if (normalized.includes("sepete özel") || normalized.includes("sepette")) {
    return false;
  }

  return (
    normalized.includes("taksit") ||
    normalized.includes("aylık") ||
    normalized.includes("kargo") ||
    normalized.includes("kupon") ||
    normalized.includes("kazanç") ||
    normalized.includes("kazan") ||
    normalized.includes("alt limit") ||
    normalized.includes("değerlendirme") ||
    normalized.includes("satıcı puanı")
  );
}

function extractPreferredPriceFromText(text: string): string {
  const basketMatch = text.match(new RegExp(`(?:sepete\\s+özel\\s+fiyat|sepette)\\D{0,80}(${PRICE_PATTERN.source})`, "i"));
  if (basketMatch?.[1]) {
    return basketMatch[1].trim();
  }

  const beforeSavings = text.split(/Kazanc(?:ı|i)m[ıi]? gör|Kazan(?:ç|c)|indirim/i)[0] ?? text;
  const matches = Array.from(beforeSavings.matchAll(new RegExp(PRICE_PATTERN.source, "gi")));
  return matches[0]?.[0]?.trim() ?? "";
}

function isExcludedPriceContext(element: Element): boolean {
  const context = element.closest(
    [
      "[data-test-id='campaigns']",
      "[data-testid='campaigns']",
      "[data-test-id='other-merchants']",
      "[data-testid='other-merchants']",
      "[data-test-id='payment-options']",
      "[data-testid='payment-options']",
      "[data-test-id='vas']",
      "[data-testid='vas']"
    ].join(",")
  );
  if (context) {
    return true;
  }

  const text = normalizeText(extractText(element)).toLocaleLowerCase("tr-TR");
  return (
    text.includes("kargo bedava") ||
    text.includes("üzerine kargo") ||
    text.includes("koruma paket") ||
    text.includes("ek hizmet") ||
    text.includes("ek garanti") ||
    text.includes("peşin fiyatına") ||
    text.includes("diğer satıcı")
  );
}

function getVisiblePriceCandidates(root: ParentNode = document): TextCandidate[] {
  const seen = new Set<string>();
  const candidates: TextCandidate[] = [];

  for (const selector of SELECTORS.price) {
    root.querySelectorAll(selector).forEach((element) => {
      if (element instanceof HTMLMetaElement) {
        const content = element.content?.trim();
        if (content && !seen.has(`${selector}:${content}`)) {
          seen.add(`${selector}:${content}`);
          candidates.push({ text: content, selector });
        }
        return;
      }

      if (!isVisibleElement(element) || isExcludedPriceContext(element)) {
        return;
      }

      const text = normalizeText(extractText(element));
      if (text && !seen.has(`${selector}:${text}`)) {
        seen.add(`${selector}:${text}`);
        candidates.push({ text, selector });
      }
    });
  }

  return candidates;
}

function pickPrice(candidates: TextCandidate[]): PriceExtraction {
  let fallback: PriceExtraction = { text: "", value: null, selector: "" };

  for (const candidate of candidates) {
    if (isPromotionalPriceText(candidate.text)) {
      continue;
    }

    const text = extractPreferredPriceFromText(candidate.text);
    const value = parsePriceValue(text);
    if (!text || !value || value <= 0) {
      continue;
    }

    if (
      !fallback.text ||
      candidate.selector.includes("current-price") ||
      candidate.selector.includes("offering-price") ||
      candidate.text.toLocaleLowerCase("tr-TR").includes("sepete özel")
    ) {
      fallback = { text, value, selector: candidate.selector };
    }
  }

  return fallback;
}

function getBasketPriceCandidates(root: ParentNode = document): TextCandidate[] {
  const seen = new Set<string>();
  const candidates: TextCandidate[] = [];

  root.querySelectorAll("section, div, span").forEach((element) => {
    if (!isVisibleElement(element) || isExcludedPriceContext(element)) {
      return;
    }

    const text = normalizeText(extractText(element));
    const normalized = text.toLocaleLowerCase("tr-TR");
    if (
      text &&
      text.length <= 260 &&
      (normalized.includes("sepete özel fiyat") || normalized.includes("sepette")) &&
      PRICE_PATTERN.test(text) &&
      !seen.has(text)
    ) {
      seen.add(text);
      candidates.push({ text, selector: "visible_text:basket_price" });
    }
  });

  return candidates;
}

function getActiveProductStatePrice(): PriceExtraction {
  const payload = getReduxStorePayload();
  const product = (payload as {
    productState?: {
      product?: {
        prices?: Array<{
          formattedPrice?: string;
          value?: number;
          currency?: string | number;
        }>;
        price?: number;
        formattedPrice?: string;
      };
    };
  } | null)?.productState?.product;

  if (!product) {
    return { text: "", value: null, selector: "" };
  }

  const statePrice = product.prices?.find((entry) => typeof entry.value === "number" && entry.value > 0);
  if (statePrice) {
    const text = statePrice.formattedPrice
      ? `${statePrice.formattedPrice} TL`
      : formatPrice(statePrice.value, statePrice.currency === 0 ? "TRY" : String(statePrice.currency ?? "TRY"));
    return { text, value: statePrice.value ?? parsePriceValue(text), selector: "redux.productState.product.prices" };
  }

  if (typeof product.price === "number" && product.price > 0) {
    const text = product.formattedPrice ? `${product.formattedPrice} TL` : formatPrice(product.price, "TRY");
    return { text, value: product.price, selector: "redux.productState.product.price" };
  }

  return { text: "", value: null, selector: "" };
}

function getPriceFromScripts(): PriceExtraction {
  const priceKeys = [
    "price",
    "finalPrice",
    "currentPrice",
    "discountedPrice",
    "salePrice",
    "sellingPrice",
    "amount"
  ];

  for (const payload of collectJsonPayloads()) {
    let found: PriceExtraction = { text: "", value: null, selector: "" };
    walkPayload(payload, (record) => {
      if (found.text) return;

      for (const key of priceKeys) {
        const value = record[key];
        const currency =
          typeof record.currency === "string"
            ? record.currency
            : typeof record.priceCurrency === "string"
              ? record.priceCurrency
              : "TRY";

        if (typeof value === "number") {
          const text = formatPrice(value, currency);
          if (text) {
            found = { text, value, selector: `json.${key}` };
            return;
          }
        }

        if (typeof value === "string" && (PRICE_PATTERN.test(value) || /^\d+(?:[,.]\d+)?$/.test(value.trim()))) {
          const text = PRICE_PATTERN.test(value) ? value.match(PRICE_PATTERN)?.[0]?.trim() ?? "" : formatPrice(value, currency);
          const parsed = parsePriceValue(text);
          if (text && parsed && parsed > 0) {
            found = { text, value: parsed, selector: `json.${key}` };
            return;
          }
        }
      }
    });

    if (found.text) {
      return found;
    }
  }

  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";
    const match = text.match(/"(?:finalPrice|currentPrice|discountedPrice|salePrice|price)"\s*:\s*"?(\d+(?:[,.]\d+)?)"?/i);
    if (match?.[1]) {
      const formatted = formatPrice(match[1], "TRY");
      return { text: formatted, value: parsePriceValue(formatted), selector: "script.price_regex" };
    }
  }

  return { text: "", value: null, selector: "" };
}

function extractPrice(): PriceExtraction {
  const basketPrice = pickPrice(getBasketPriceCandidates());
  if (basketPrice.text) {
    return basketPrice;
  }

  const activeProductPrice = getActiveProductStatePrice();
  if (activeProductPrice.text) {
    return activeProductPrice;
  }

  const direct = pickPrice(getVisiblePriceCandidates());
  if (direct.text) {
    return direct;
  }

  const structured = getStructuredProductData();
  const offers = Array.isArray(structured?.offers) ? structured?.offers : structured?.offers ? [structured.offers] : [];
  for (const offer of offers) {
    const text = formatPrice(offer.price, offer.priceCurrency);
    if (text) {
      return { text, value: parsePriceValue(text), selector: "structured_data.offers.price" };
    }
  }

  const scriptPrice = getPriceFromScripts();
  if (scriptPrice.text) {
    return scriptPrice;
  }

  return { text: "", value: null, selector: "" };
}

function pickSeller(candidates: string[]): string {
  for (const candidate of candidates) {
    const cleaned = normalizeText(candidate)
      .replace(/^Satıcı\s*:?\s*/i, "")
      .replace(/\s+Satıcı puanı.*$/i, "")
      .replace(/\s+Resmi Satıcı.*$/i, "")
      .trim();

    if (cleaned && cleaned.length <= 100 && !PRICE_PATTERN.test(cleaned) && !/^\d+(?:[,.]\d+)?$/.test(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

function extractSeller(): string {
  const merchantState = extractActiveMerchantState();
  if (merchantState?.name) {
    return normalizeText(merchantState.name);
  }

  const structured = getStructuredProductData();
  const offers = Array.isArray(structured?.offers) ? structured?.offers : structured?.offers ? [structured.offers] : [];
  for (const offer of offers) {
    if (offer.seller?.name) {
      return normalizeText(offer.seller.name);
    }
  }

  const scriptSeller = getStringByKeys(["merchantName", "sellerName", "merchant", "seller"]);
  if (scriptSeller && scriptSeller.length <= 100) {
    return pickSeller([scriptSeller]);
  }

  const candidates = getVisibleCandidates(SELECTORS.seller).map((candidate) => candidate.text);
  const visibleSeller = pickSeller(candidates);
  if (visibleSeller) {
    return visibleSeller;
  }

  const bodyMatch = (document.body?.innerText ?? "").match(/Satıcı\s*:\s*([^\n\r]+)/i);
  return pickSeller([bodyMatch?.[1] ?? ""]);
}

function extractActiveMerchantState(): HepsiburadaMerchantState | null {
  const payload = getReduxStorePayload();
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const directMerchant = (payload as {
    productState?: {
      product?: {
        merchantName?: string;
        merchantId?: string;
        merchant?: HepsiburadaMerchantState;
      };
    };
  }).productState?.product;

  if (directMerchant?.merchant) {
    return directMerchant.merchant;
  }

  if (directMerchant?.merchantName) {
    return {
      name: directMerchant.merchantName,
      id: directMerchant.merchantId
    };
  }

  let merchant: HepsiburadaMerchantState | null = null;
  walkPayload(payload, (record) => {
    if (merchant) {
      return;
    }

    const candidate = record.merchant;
    if (candidate && typeof candidate === "object") {
      const merchantRecord = candidate as HepsiburadaMerchantState;
      if (typeof merchantRecord.name === "string") {
        merchant = merchantRecord;
      }
    }
  });

  return merchant;
}

function parseRating(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === "string" && value.trim()) {
    return extractNumber(value);
  }
  return 0;
}

function extractRating(): number {
  const structured = getStructuredProductData();
  const structuredRating = parseRating(structured?.aggregateRating?.ratingValue);
  if (structuredRating > 0) {
    return structuredRating;
  }

  const scriptRating = getNumberByKeys(["ratingValue", "averageRating", "rating", "rate"]);
  if (scriptRating && scriptRating > 0 && scriptRating <= 5) {
    return scriptRating;
  }

  for (const candidate of getVisibleCandidates(SELECTORS.rating)) {
    const rating = parseRating(candidate.text);
    if (rating > 0 && rating <= 5) {
      return rating;
    }
  }

  const bodyMatch = (document.body?.innerText ?? "").match(/(?:^|\n)\s*([1-5](?:[,.]\d)?)\s*(?:\n|\s+)(?:\d[\d.]*\s*)?Değerlendirme/i);
  return parseRating(bodyMatch?.[1]);
}

function parseCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.replace(/\s+/g, " ").match(/(\d[\d.]*)/);
  if (!match) {
    return undefined;
  }

  const count = Number(match[1].replace(/\./g, ""));
  return Number.isFinite(count) ? count : undefined;
}

function parseTurkishCompactNumber(value: string): number | undefined {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  const match = normalized.match(/(\d+(?:[,.]\d+)?)\s*([BMK])?/i);
  if (!match) {
    return undefined;
  }

  const suffix = match[2]?.toLocaleLowerCase("tr-TR");
  const amountText = suffix
    ? match[1].replace(",", ".")
    : match[1].replace(/\./g, "").replace(",", ".");
  const amount = Number(amountText);
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const multiplier = suffix === "m" ? 1_000_000 : suffix === "b" || suffix === "k" ? 1_000 : 1;
  return Math.round(amount * multiplier);
}

function getReviewCountFromPage(fallback: number): number {
  const structured = getStructuredProductData();
  const structuredCount = parseCount(structured?.aggregateRating?.reviewCount ?? structured?.aggregateRating?.ratingCount);
  if (structuredCount !== undefined) {
    return Math.max(structuredCount, fallback);
  }

  const scriptCount = getNumberByKeys(["reviewCount", "ratingCount", "commentCount"]);
  if (scriptCount !== undefined) {
    return Math.max(Math.round(scriptCount), fallback);
  }

  const bodyText = document.body?.innerText ?? "";
  const matches = Array.from(bodyText.matchAll(/(\d[\d.]*)\s*Değerlendirme/gi));
  const counts = matches.map((match) => parseCount(match[1])).filter((count): count is number => count !== undefined);
  return Math.max(fallback, ...counts);
}

function getStructuredReviewDetails(): ScrapedReviewDetail[] {
  const structured = getStructuredProductData();
  return (structured?.review ?? [])
    .map((review, index) => {
      const text = normalizeText(review.reviewBody ?? review.name ?? "");
      if (text.length <= 15) {
        return null;
      }

      const rating = parseRating(review.reviewRating?.ratingValue);
      const detail: ScrapedReviewDetail = {
        id: `structured-${index}`,
        text,
        rating: rating > 0 ? rating : undefined
      };
      if (review.datePublished) {
        detail.created_at = review.datePublished;
      }
      return detail;
    })
    .filter((review): review is ScrapedReviewDetail => review !== null);
}

function collectReviewDetailsFromScripts(): ScrapedReviewDetail[] {
  const details: ScrapedReviewDetail[] = [];
  const seen = new Set<string>();

  for (const payload of collectJsonPayloads()) {
    walkPayload(payload, (record) => {
      const rawText =
        (typeof record.comment === "string" && record.comment) ||
        (typeof record.reviewText === "string" && record.reviewText) ||
        (typeof record.reviewBody === "string" && record.reviewBody) ||
        (typeof record.content === "string" && /review|comment|yorum/i.test(Object.keys(record).join(" ")) && record.content) ||
        "";

      const text = normalizeText(rawText);
      const key = normalizeReviewKey(text);
      if (!key || text.length <= 15 || seen.has(key)) {
        return;
      }

      seen.add(key);
      const rating = parseRating(record.rating ?? record.rate ?? record.ratingValue);
      const createdAt =
        typeof record.createdAt === "string"
          ? record.createdAt
          : typeof record.date === "string"
            ? record.date
            : typeof record.reviewDate === "string"
              ? record.reviewDate
              : undefined;
      details.push({
        id: typeof record.id === "string" || typeof record.id === "number" ? record.id : `json-${details.length}`,
        text,
        rating: rating > 0 ? rating : undefined,
        created_at: createdAt
      });
    });
  }

  return details;
}

function isReviewLikeText(text: string): boolean {
  if (text.length <= 15 || text.length > 1000) {
    return false;
  }

  return !/^(?:Bu değerlendirme faydalı mı|Teşekkür Ederiz|Bildir|Değerlendir|Filtrele|Sırala|Varsayılan|Ürün Puanı|Satıcı|Tüm Değerlendirmeler|Kullanıcı fotoğraf)/i.test(text);
}

function collectReviewDetailsFromDom(): ScrapedReviewDetail[] {
  const seen = new Set<string>();
  const details: ScrapedReviewDetail[] = [];

  document.querySelectorAll(SELECTORS.reviews.join(", ")).forEach((element) => {
    const text = normalizeText(extractText(element));
    const key = normalizeReviewKey(text);
    if (isReviewLikeText(text) && !seen.has(key)) {
      seen.add(key);
      details.push({ id: `dom-${details.length}`, text });
    }
  });

  if (details.length > 0) {
    return details;
  }

  const lines = (document.body?.innerText ?? "")
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const datePattern = /\d{1,2}\s+(?:Ocak|Şubat|Subat|Mart|Nisan|Mayıs|Mayis|Haziran|Temmuz|Ağustos|Agustos|Eylül|Eylul|Ekim|Kasım|Kasim|Aralık|Aralik)(?:\s+\d{4})?/i;

  for (let index = 0; index < lines.length; index += 1) {
    if (!datePattern.test(lines[index])) {
      continue;
    }

    for (let offset = 1; offset <= 5 && index + offset < lines.length; offset += 1) {
      const text = lines[index + offset];
      if (/^[A-ZÇĞİÖŞÜ]{1,3}$/.test(text) || /^[A-Za-zÇĞİÖŞÜçğıöşü*.\s]{3,30}$/.test(text)) {
        continue;
      }
      const key = normalizeReviewKey(text);
      if (isReviewLikeText(text) && !seen.has(key)) {
        seen.add(key);
        details.push({ id: `text-${details.length}`, text, created_at: lines[index] });
        break;
      }
    }
  }

  return details;
}

function collectReviewDetails(): { reviewDetails: ScrapedReviewDetail[]; source: ScrapeSource } {
  const seen = new Set<string>();
  const reviewDetails: ScrapedReviewDetail[] = [];

  function add(details: ScrapedReviewDetail[]) {
    for (const detail of details) {
      const key = normalizeReviewKey(detail.text);
      if (key && !seen.has(key)) {
        seen.add(key);
        reviewDetails.push(detail);
      }
    }
  }

  const structured = getStructuredReviewDetails();
  add(structured);

  const script = collectReviewDetailsFromScripts();
  add(script);

  const dom = collectReviewDetailsFromDom();
  add(dom);

  if (structured.length > 0) {
    return { reviewDetails, source: "structured_data" };
  }

  return { reviewDetails, source: reviewDetails.length > 0 ? "dom" : "fallback" };
}

function parseSellerScore(value: string): number | undefined {
  const match = normalizeText(value).match(/(?:Satıcı puanı\s*)?(10|[1-9](?:[,.]\d)?)(?:\s*Satıcı puanı)?/i);
  if (!match) {
    return undefined;
  }

  const score = Number(match[1].replace(",", "."));
  return Number.isFinite(score) && score >= 0 && score <= 10 ? score : undefined;
}

function extractSellerMetadata(seller: string): SellerMetadata {
  const bodyText = document.body?.innerText ?? "";
  const sellerName = seller && seller !== "N/A" ? seller : undefined;
  const merchantState = extractActiveMerchantState();
  const storeLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find((link) => {
    const text = normalizeText(extractText(link));
    const href = link.href || "";
    return href.includes("/magaza/") || (!!sellerName && text.includes(sellerName));
  });

  const officialSeller = /Resmi Satıcı|Onaylanmış Satıcı|Güvenilir Satıcı/i.test(bodyText);
  const freeShipping = /kargo bedava|ücretsiz kargo|bedava kargo/i.test(bodyText);
  const fastDelivery = /yarın kapında|bugün teslimat|hızlı teslimat|hepsijet|yarın kargoda/i.test(bodyText);
  const stateScore = typeof merchantState?.lifetimeRating === "number" && merchantState.lifetimeRating > 0
    ? merchantState.lifetimeRating
    : undefined;
  const stateRatingCount = typeof merchantState?.ratingQuantity === "number" && merchantState.ratingQuantity > 0
    ? merchantState.ratingQuantity
    : undefined;
  const score = [
    bodyText.match(/(?:Satıcı puanı|seller score)[^\n\r]{0,80}/i)?.[0] ?? "",
    bodyText.match(/(?:Satıcı puanı|seller score)[\s\S]{0,80}/i)?.[0] ?? "",
    bodyText.match(/(?:10|[1-9](?:[,.]\d)?)\s*Satıcı puanı/i)?.[0] ?? ""
  ]
    .map(parseSellerScore)
    .find((value): value is number => value !== undefined) ?? getNumberByKeys(["merchantRating", "sellerScore", "sellerRating"]);

  const badges = Array.from(
    new Set(
      [
        officialSeller ? "Resmi Satıcı" : "",
        freeShipping ? "Kargo Bedava" : "",
        fastDelivery ? "Hızlı Teslimat" : "",
        ...Array.from(document.querySelectorAll("[data-test-id*='badge'], [data-testid*='badge'], [class*='badge'], [class*='Badge']"))
          .map((element) => normalizeText(extractText(element)))
          .filter((text) => text.length > 0 && text.length <= 80)
      ].filter(Boolean)
    )
  ).slice(0, 12);
  const followerMatch = bodyText.match(/(\d+(?:[,.]\d+)?)\s*([BMK])?\s*takipçi/i);
  const isPlatformSeller =
    sellerName?.toLocaleLowerCase("tr-TR") === "hepsiburada" ||
    merchantState?.name?.toLocaleLowerCase("tr-TR") === "hepsiburada";
  const merchantLabel = merchantState?.labelName || "";
  const verifiedSeller = officialSeller || /Resmi Satıcı|Yetkili satıcı|onaylanmış satıcı/i.test(merchantLabel) || isPlatformSeller;
  const marketplaceSellerScore = stateScore ?? (
    isPlatformSeller
      ? verifiedSeller ? 10 : undefined
      : score && score <= 10 ? score : undefined
  );
  const sellerBadges = Array.from(new Set([
    ...badges,
    merchantLabel,
    isPlatformSeller ? "Hepsiburada Resmi Satıcı" : "",
    isPlatformSeller ? "Platform Official Seller" : ""
  ].filter(Boolean)));

  return {
    seller_name: sellerName,
    marketplace_seller_score: marketplaceSellerScore,
    seller_follower_count: stateRatingCount ?? (followerMatch
      ? parseTurkishCompactNumber(`${followerMatch[1]}${followerMatch[2] ?? ""}`)
      : isPlatformSeller
        ? 2_200_000
        : undefined),
    seller_badges: sellerBadges,
    verified_badge_available: verifiedSeller,
    fast_delivery_available: fastDelivery,
    free_shipping_available: freeShipping,
    store_url: storeLink?.href || (isPlatformSeller ? `${window.location.origin}/magaza/hepsiburada` : undefined)
  };
}

function mergeSellerMetadata(base: SellerMetadata, extra?: SellerMetadata | null): SellerMetadata {
  if (!extra) {
    return base;
  }

  return {
    seller_name: extra.seller_name || base.seller_name,
    marketplace_seller_score: extra.marketplace_seller_score ?? base.marketplace_seller_score,
    seller_age_days: extra.seller_age_days ?? base.seller_age_days,
    seller_follower_count: extra.seller_follower_count ?? base.seller_follower_count,
    seller_badges: Array.from(new Set([...(base.seller_badges ?? []), ...(extra.seller_badges ?? [])])),
    verified_badge_available: !!(base.verified_badge_available || extra.verified_badge_available),
    fast_delivery_available: !!(base.fast_delivery_available || extra.fast_delivery_available),
    free_shipping_available: !!(base.free_shipping_available || extra.free_shipping_available),
    store_url: extra.store_url || base.store_url
  };
}

function extractSellerMetadataFromStorefront(doc: Document, storeUrl: string): SellerMetadata {
  const bodyText = doc.body?.innerText ?? "";
  const title = normalizeText(extractText(doc.querySelector("h1"))) || undefined;
  const followerMatch = bodyText.match(/(\d+(?:[,.]\d+)?)\s*([BMK])?\s*takipçi/i);
  const officialSeller = /Resmi Satıcı|Yetkili satıcı|onaylanmış satıcı|marka tescil belgesi/i.test(bodyText);
  const fastDelivery = /yarın kapında|bugün teslimat|hızlı teslimat|hepsijet|yarın kargoda/i.test(bodyText);
  const freeShipping = /kargo bedava|ücretsiz kargo|bedava kargo/i.test(bodyText);
  const productCountMatch = bodyText.match(/(\d+(?:[,.]\d+)?)\s*([BMK])?\s*ürün/i);
  const isPlatformSeller = title?.toLocaleLowerCase("tr-TR") === "hepsiburada";
  const storefrontScore = [
    bodyText.match(/(?:Satıcı puanı|seller score)[^\n\r]{0,80}/i)?.[0] ?? "",
    bodyText.match(/(?:Satıcı puanı|seller score)[\s\S]{0,80}/i)?.[0] ?? "",
    bodyText.match(/(?:10|[1-9](?:[,.]\d)?)\s*Satıcı puanı/i)?.[0] ?? ""
  ]
    .map(parseSellerScore)
    .find((value): value is number => value !== undefined);

  const badges = Array.from(new Set([
    officialSeller ? "Resmi Satıcı" : "",
    isPlatformSeller ? "Hepsiburada Resmi Satıcı" : "",
    isPlatformSeller ? "Platform Official Seller" : "",
    productCountMatch ? `${productCountMatch[0].replace(/^•/, "").trim()}` : "",
    fastDelivery ? "Hızlı Teslimat" : "",
    freeShipping ? "Kargo Bedava" : ""
  ].filter(Boolean)));

  return {
    seller_name: title,
    marketplace_seller_score: storefrontScore ?? (isPlatformSeller && officialSeller ? 10 : undefined),
    seller_follower_count: followerMatch
      ? parseTurkishCompactNumber(`${followerMatch[1]}${followerMatch[2] ?? ""}`)
      : isPlatformSeller
        ? 2_200_000
        : undefined,
    seller_badges: badges,
    verified_badge_available: officialSeller || isPlatformSeller,
    fast_delivery_available: fastDelivery,
    free_shipping_available: freeShipping,
    store_url: storeUrl
  };
}

async function fetchStorefrontSellerMetadata(storeUrl: string | undefined): Promise<SellerMetadata | null> {
  if (!storeUrl) {
    return null;
  }

  try {
    const url = new URL(storeUrl, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }

    const response = await fetch(`${url.pathname}${url.search || ""}`, {
      credentials: "omit"
    });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const metadata = extractSellerMetadataFromStorefront(doc, url.toString());
    return metadata.seller_follower_count || metadata.seller_badges?.length || metadata.verified_badge_available
      ? metadata
      : null;
  } catch (error) {
    console.warn("[BiBak] Hepsiburada store metadata fetch failed", error);
    return null;
  }
}

function buildMetadata(
  product: Omit<ScrapedProduct, "metadata">,
  productId: string | null,
  source: ScrapeSource,
  diagnostics?: ScrapeMetadata["diagnostics"]
): ScrapeMetadata {
  const missingFields: MissingProductField[] = [];
  const warnings: ScrapeWarning[] = [];
  const reviewCount = getReviewCountFromPage(product.reviews.length);

  if (!product.title) {
    missingFields.push("title");
    warnings.push("missing_title");
  }

  if (!product.price || product.price === "N/A") {
    missingFields.push("price");
    warnings.push("missing_price");
  }

  if (!product.seller || product.seller === "N/A") {
    missingFields.push("seller");
    warnings.push("missing_seller");
  }

  if (!product.rating) {
    missingFields.push("rating");
    warnings.push("missing_rating");
  }

  if (product.reviews.length === 0) {
    missingFields.push("reviews");
    warnings.push(reviewCount >= LOW_REVIEW_COUNT_THRESHOLD ? "review_text_unavailable" : "no_reviews");
  } else if (product.reviews.length < LOW_REVIEW_COUNT_THRESHOLD) {
    warnings.push(reviewCount >= LOW_REVIEW_COUNT_THRESHOLD ? "review_text_unavailable" : "low_review_count");
  }

  const sourceScore: Record<ScrapeSource, number> = {
    structured_data: 88,
    trendyol_detailed_api: 92,
    trendyol_review_api: 82,
    trendyol_review_page: 76,
    amazon_review_page: 84,
    dom: 68,
    fallback: 35
  };
  const reviewScore = Math.min(product.reviews.length, 20) * 1.5;
  const missingPenalty = missingFields.length * 12;
  const lowReviewPenalty = product.reviews.length > 0 && product.reviews.length < LOW_REVIEW_COUNT_THRESHOLD ? 8 : 0;
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(sourceScore[source] + reviewScore - missingPenalty - lowReviewPenalty))
  );

  return {
    productId: productId ?? undefined,
    listingId: productId ?? undefined,
    source,
    diagnostics,
    confidence,
    reviewCount,
    missingFields,
    warnings
  };
}

export class HepsiburadaScraper implements Scraper {
  canHandle(url: string): boolean {
    return url.includes("hepsiburada.com");
  }

  async scrape(): Promise<ScrapedProduct> {
    console.log("[BiBak] Starting Hepsiburada scrape...");

    await waitForElement("body", 5000);
    await waitForElement("h1", 5000);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const productId = extractProductIdFromUrl(window.location.href);
    const title = extractTitle();
    const price = extractPrice();
    const seller = extractSeller();
    const rating = extractRating();
    const baseSellerMetadata = extractSellerMetadata(seller);
    const storefrontSellerMetadata = await fetchStorefrontSellerMetadata(baseSellerMetadata.store_url);
    const sellerMetadata = mergeSellerMetadata(baseSellerMetadata, storefrontSellerMetadata);
    const { reviewDetails, source } = collectReviewDetails();
    const reviews = reviewDetails.map((review) => review.text);

    const product = {
      title,
      price: price.text || "N/A",
      seller: seller || "N/A",
      reviews,
      reviewDetails: reviewDetails.length > 0
        ? reviewDetails
        : reviews.map((review) => ({ text: review, rating: rating || undefined })),
      rating,
      platform: "hepsiburada",
      sellerMetadata
    } satisfies Omit<ScrapedProduct, "metadata">;

    const scraped: ScrapedProduct = {
      ...product,
      metadata: buildMetadata(product, productId, source, {
        priceText: price.text || undefined,
        parsedPrice: price.value,
        priceSelector: price.selector || undefined,
        selectedListingId: productId,
        contentId: productId
      })
    };

    console.log("[BiBak] Scraped Hepsiburada data:", {
      title: scraped.title,
      price: scraped.price,
      seller: scraped.seller,
      rating: scraped.rating,
      reviewsCount: scraped.reviews.length,
      sellerMetadata: scraped.sellerMetadata,
      metadata: scraped.metadata,
      reviewSample: scraped.reviews.slice(0, 3),
      reviewDetailsSample: scraped.reviewDetails?.slice(0, 3)
    });

    if (!scraped.title && scraped.reviews.length === 0) {
      throw new Error("Hepsiburada product data could not be extracted");
    }

    return scraped;
  }
}
