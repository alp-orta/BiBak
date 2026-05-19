import { ScrapedProduct, Scraper, type ExternalPriceHistory, type MissingProductField, type ScrapedReviewDetail, type ScrapeMetadata, type ScrapeSource, type ScrapeWarning, type SellerMetadata } from "./index";
import { queryAll, extractText, extractNumber, waitForElement } from "./utils";

const SELECTORS = {
  title: [
    "h1",
    "[data-testid='product-name']",
    "[data-testid*='product-name']",
    "meta[property='og:title']"
  ],
  price: [
    "[data-testid='ty-plus-price'] .ty-plus-price-discounted-price",
    "[data-testid='ty-plus-price']",
    ".ty-plus-price-discounted-price",
    ".ty-plus-price-content",
    ".price-wrapper .discounted",
    "[data-testid='normal-price'] .discounted",
    "[data-testid='normal-price']",
    ".prc-dsc",
    ".prc-box-dscntd",
    ".pr-bx-nm .prc-dsc",
    ".price-information .prc-dsc",
    "[data-testid='price-current-price']"
  ],
  seller: [
    "[data-testid='seller-name']",
    "[data-testid*='seller']",
    "[class*='seller']",
    "[class*='merchant']"
  ],
  rating: [
    "[data-testid='rating-score']",
    "[data-testid*='rating']",
    "[class*='rating']",
    "[class*='star']"
  ],
  reviews: [
    ".r-content",
    ".rnr-com-tx",
    ".comment-text p",
    ".rvw-cnt p",
    ".review-text p",
    "[data-testid*='review'] p",
    "[data-testid*='comment'] p"
  ]
};

const REVIEW_API_BASE = "https://public-mdc.trendyol.com/discovery-web-socialgw-service/api/review";
const REVIEW_DETAIL_API_BASE = "https://apigw.trendyol.com/discovery-storefront-trproductgw-service/api/review-read/product-reviews/detailed";
const PRICE_HISTORY_API_BASE = "https://apigw.trendyol.com/discovery-pdp-websfxpricehistory-santral/price-history";
const PRICE_PATTERN = /(?:₺\s*[\d.]+(?:,\d{2})?|[\d.]+(?:,\d{2})?\s*(?:TL|₺))/i;
const TARGET_REVIEW_COUNT = 100;
const LOW_REVIEW_COUNT_THRESHOLD = 5;

type ReviewApiPayload = {
  rating?: number;
  reviews: string[];
};

type ReviewComment = {
  id?: number;
  reviewId?: number;
  comment?: string;
  rate?: number;
  createdAt?: string;
  creationDate?: string;
  date?: string;
  datePublished?: string;
  commentDate?: string;
  commentDateISO?: string;
  commentDateISOtype?: string;
  commentDateText?: string;
  createdDate?: string;
  reviewDate?: string;
  lastModifiedDate?: string;
};

type DetailedReviewApiPayload = {
  rating?: number;
  totalPages?: number;
  reviews: string[];
  reviewDetails?: ScrapedReviewDetail[];
};

type ReviewDetailPayload = {
  rating?: number;
  reviewCount?: number;
  reviews: string[];
};

type ProductStructuredData = {
  name?: string;
  description?: string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
  };
  aggregateRating?: {
    ratingValue?: string | number;
    reviewCount?: string | number;
    ratingCount?: string | number;
  };
  review?: Array<{
    reviewBody?: string;
    datePublished?: string;
    reviewRating?: {
      ratingValue?: string | number;
    };
  }>;
};

type ReviewDetailPageProps = {
  product?: {
    ratingScore?: {
      averageRating?: number;
      commentCount?: number;
      totalCount?: number;
    };
  };
  reviewImages?: {
    content?: Array<{
      comment?: string;
    }>;
  };
};

type TrendyolPriceHistoryResponse = {
  prices?: Record<string, number>;
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

function getWindowProps<T>(name: string): T | null {
  return ((window as unknown) as Record<string, T | undefined>)[`__${name}__PROPS`] ?? null;
}

function extractProductIdFromUrl(url: string): string | null {
  const match = url.match(/-p-(\d+)/i);
  return match?.[1] ?? null;
}

function addUniqueListingId(values: string[], listingId: unknown): void {
  if (typeof listingId === "string" && listingId && !values.includes(listingId)) {
    values.push(listingId);
  }
}

function findListingIdsInPayload(payload: unknown, productId: string | null, seen = new Set<unknown>()): string[] {
  if (!payload || typeof payload !== "object" || seen.has(payload)) {
    return [];
  }
  seen.add(payload);

  const listingIds: string[] = [];
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      findListingIdsInPayload(entry, productId, seen).forEach((listingId) => addUniqueListingId(listingIds, listingId));
    }
    return listingIds;
  }

  const record = payload as Record<string, unknown>;
  const winnerVariant = record.winnerVariant;
  if (winnerVariant && typeof winnerVariant === "object") {
    addUniqueListingId(listingIds, (winnerVariant as Record<string, unknown>).listingId);
  }

  const url = typeof record.url === "string" ? record.url : "";
  const listingId = record.listingId;
  if (typeof listingId === "string" && listingId && (!productId || url.includes(`p-${productId}`) || !url)) {
    addUniqueListingId(listingIds, listingId);
  }

  for (const value of Object.values(record)) {
    findListingIdsInPayload(value, productId, seen).forEach((id) => addUniqueListingId(listingIds, id));
  }

  return listingIds;
}

function extractListingIdsFromScripts(productId: string | null): string[] {
  const scriptTexts = Array.from(document.scripts)
    .map((script) => script.textContent || "")
    .filter((text) => text.includes("listingId"));
  const listingIds: string[] = [];

  for (const text of scriptTexts) {
    if (productId) {
      const aroundProduct = text.match(new RegExp(`.{0,1800}p-${productId}.{0,1800}`, "s"))?.[0] ?? "";
      const nearbyListing = aroundProduct.match(/"listingId":"([^"]+)"/);
      addUniqueListingId(listingIds, nearbyListing?.[1]);
    }

    const winnerListing = text.match(/"winnerVariant":\{[^}]*"listingId":"([^"]+)"/);
    addUniqueListingId(listingIds, winnerListing?.[1]);

    Array.from(text.matchAll(/"listingId":"([^"]+)"/g)).forEach((match) => {
      addUniqueListingId(listingIds, match[1]);
    });
  }

  return listingIds;
}

function extractListingIds(productId: string | null): string[] {
  const listingIds: string[] = [];
  const props = getWindowProps<Record<string, unknown>>("envoy_product-info");
  findListingIdsInPayload(props, productId).forEach((listingId) => addUniqueListingId(listingIds, listingId));
  extractListingIdsFromScripts(productId).forEach((listingId) => addUniqueListingId(listingIds, listingId));

  return listingIds;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*Fiyat[ıi],?\s*Yorumlar[ıi]\s*-\s*Trendyol$/i, "")
    .replace(/\s*-\s*Trendyol$/i, "")
    .trim();
}

function getMetaContent(selector: string): string {
  const value = document.querySelector(selector)?.getAttribute("content") ?? "";
  return value.trim();
}

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractAssignedJson<T>(html: string, variableName: string): T | null {
  const marker = `window["__${variableName}__PROPS"]=`;
  const start = html.indexOf(marker);
  if (start === -1) {
    return null;
  }

  let index = start + marker.length;
  while (index < html.length && html[index] !== "{") {
    index += 1;
  }

  if (index >= html.length) {
    return null;
  }

  const begin = index;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return parseJsonSafely<T>(html.slice(begin, index + 1));
      }
    }
  }

  return null;
}

function getStructuredProductData(): ProductStructuredData | null {
  const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));

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

function formatPrice(value: string | number | undefined, currency: string | undefined): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return "";
  }

  if (currency === "TRY") {
    const amount = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numeric);

    return `${amount} TL`;
  }

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY"
  }).format(numeric);
}

function getMerchantFromPageScripts(): string {
  const scripts = Array.from(document.scripts);

  for (const script of scripts) {
    const text = script.textContent || "";
    const match = text.match(/"product_merchant":"([^"]+)"/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function getProductPriceFromDataLayer(): PriceExtraction {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent || "";
    const match = text.match(/"product_price"\s*:\s*(\d+(?:\.\d+)?)/);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) {
        return {
          text: `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} TL`,
          value,
          selector: "__PRODUCT_DETAIL__DATALAYER.product_price"
        };
      }
    }
  }

  return { text: "", value: null, selector: "" };
}

function isVisibleElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getProductDetailRoot(): ParentNode {
  const rootSelectors = [
    "[data-drroot='product-detail']",
    "[data-fragment='product-detail']",
    "[fragment-partial='product-detail']",
    "[data-testid='product-detail']",
    ".product-details-product-details-container",
    ".product-detail-container",
    ".product-container",
    ".pdp-container"
  ];

  for (const selector of rootSelectors) {
    const element = document.querySelector(selector);
    if (element && isVisibleElement(element)) {
      return element;
    }
  }

  return document;
}

function getVisibleCandidates(selectors: string[], root: ParentNode = document): TextCandidate[] {
  const seen = new Set<string>();
  const candidates: TextCandidate[] = [];

  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((element) => {
      if (!isVisibleElement(element)) {
        return;
      }

      const text = extractText(element);
      const key = `${selector}:${text}`;
      if (text && !seen.has(key)) {
        seen.add(key);
        candidates.push({ text, selector });
      }
    });
  }

  return candidates;
}

function getBasketPriceCandidates(root: ParentNode = document): TextCandidate[] {
  const seen = new Set<string>();
  const candidates: TextCandidate[] = [];
  root.querySelectorAll("div, span").forEach((element) => {
    if (!isVisibleElement(element)) return;

    const text = extractText(element);
    if (
      text &&
      text.length <= 180 &&
      text.toLocaleLowerCase("tr-TR").includes("sepette") &&
      PRICE_PATTERN.test(text) &&
      !isPromotionalPriceText(text) &&
      !seen.has(text)
    ) {
      seen.add(text);
      candidates.push({ text, selector: "visible_text:sepette" });
    }
  });

  return candidates;
}

function isPromotionalPriceText(text: string): boolean {
  const normalized = text.toLocaleLowerCase("tr-TR");
  if (hasBasketSalePrice(text)) {
    return false;
  }
  return (
    normalized.includes("kupon") ||
    normalized.includes("coupon") ||
    normalized.includes("kazan") ||
    normalized.includes("indirim") ||
    normalized.includes("kampanya") ||
    normalized.includes("alt limit") ||
    normalized.includes("fırsat") ||
    normalized.includes("firsat") ||
    normalized.includes("üzeri") ||
    normalized.includes("kargo bedava") ||
    normalized.includes("uygulanacak")
  );
}

function hasBasketSalePrice(text: string): boolean {
  return /sepette\b[\s\S]{0,80}(?:₺\s*)?\d[\d.]*(?:,\d{2})?\s*(?:TL|₺)/i.test(text);
}

function parsePriceValue(value: string): number | null {
  const number = value.replace(/[^\d.,]/g, "");
  const normalized = number.includes(",")
    ? number.replace(/\./g, "").replace(",", ".")
    : number.split(".").length > 1 && number.split(".").at(-1)?.length === 3
      ? number.replace(/\./g, "")
      : number;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickPrice(candidates: TextCandidate[]): PriceExtraction {
  let fallback: PriceExtraction = { text: "", value: null, selector: "" };

  for (const candidate of candidates) {
    if (isPromotionalPriceText(candidate.text) && !hasBasketSalePrice(candidate.text)) {
      continue;
    }

    const matches = Array.from(candidate.text.matchAll(new RegExp(PRICE_PATTERN.source, "gi")));
    const productPriceMatches = matches
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const end = (item.index ?? 0) + item[0].length;
        return !/^\s*(?:\/|per\b|başına\b|adet\b|tablet\b|kapsül\b|kg\b|g\b|gr\b|ml\b|l\b|lt\b|unit\b|piece\b|pcs\b)/i.test(candidate.text.slice(end, end + 32));
      });

    const basketPriceMatches = productPriceMatches.filter(({ item, index }) => {
      const previousEnd = index > 0 ? (matches[index - 1].index ?? 0) + matches[index - 1][0].length : Math.max(0, (item.index ?? 0) - 48);
      return candidate.text.slice(previousEnd, item.index ?? 0).toLocaleLowerCase("tr-TR").includes("sepette");
    });
    const basketSelected = basketPriceMatches[0]?.item[0]?.trim();
    if (basketSelected) {
      return { text: basketSelected, value: parsePriceValue(basketSelected), selector: candidate.selector };
    }

    const selected = productPriceMatches.at(-1)?.item[0]?.trim();
    if (selected && !fallback.text) {
      fallback = { text: selected, value: parsePriceValue(selected), selector: candidate.selector };
    }
  }

  return fallback;
}

function pickSeller(candidates: string[]): string {
  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(/^Satıcı:\s*/i, "")
      .replace(/^Seller:\s*/i, "")
      .trim();

    if (cleaned && cleaned.length <= 80 && !PRICE_PATTERN.test(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

function uniqueTexts(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 15)
    )
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeReviewKey(value: string): string {
  return normalizeText(value).toLocaleLowerCase("tr-TR");
}

function coerceReviewDate(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["date", "value", "isoDate", "formattedDate", "text"]) {
    const nested = coerceReviewDate(record[key]);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function extractReviewCreatedAt(value: ReviewComment): string | undefined {
  for (const key of [
    "createdAt",
    "creationDate",
    "date",
    "datePublished",
    "commentDate",
    "commentDateISO",
    "commentDateISOtype",
    "commentDateText",
    "createdDate",
    "reviewDate",
    "lastModifiedDate"
  ] as const) {
    const date = coerceReviewDate(value[key]);
    if (date) {
      return date;
    }
  }

  return undefined;
}

function getStructuredReviewDetails(): ScrapedReviewDetail[] {
  const structuredData = getStructuredProductData();
  return (structuredData?.review ?? [])
    .map((review, index) => {
      const text = normalizeText(review.reviewBody ?? "");
      if (text.length <= 15) {
        return null;
      }

      const ratingValue = review.reviewRating?.ratingValue;
      const rating = typeof ratingValue === "number" ? ratingValue : Number(String(ratingValue ?? ""));

      const detail: ScrapedReviewDetail = {
        id: `structured-${index}`,
        text,
        rating: Number.isFinite(rating) && rating > 0 ? rating : undefined
      };
      if (review.datePublished) {
        detail.created_at = review.datePublished;
      }
      return detail;
    })
    .filter((review): review is ScrapedReviewDetail => review !== null);
}

function enrichReviewDetailsWithStructuredDates(reviewDetails: ScrapedReviewDetail[]): ScrapedReviewDetail[] {
  const structuredByText = new Map(
    getStructuredReviewDetails().map((review) => [normalizeReviewKey(review.text), review])
  );

  return reviewDetails.map((review) => {
    if (review.created_at) {
      return review;
    }

    const structured = structuredByText.get(normalizeReviewKey(review.text));
    if (!structured?.created_at && !structured?.rating) {
      const { created_at: _createdAt, ...withoutUndefinedDate } = review;
      return withoutUndefinedDate;
    }

    return {
      ...review,
      rating: review.rating ?? structured.rating,
      created_at: structured.created_at
    };
  });
}

function collectReviewDetailsById(values: ReviewComment[]): ScrapedReviewDetail[] {
  const seenIds = new Set<number>();
  const seenTexts = new Set<string>();
  const details: ScrapedReviewDetail[] = [];

  for (const value of values) {
    const reviewId = value.reviewId ?? value.id;
    if (typeof reviewId === "number") {
      if (seenIds.has(reviewId)) {
        continue;
      }
      seenIds.add(reviewId);
    }

    const text = normalizeText(value.comment ?? "");
    if (text.length > 15) {
      const key = `${reviewId ?? ""}:${text}`;
      if (seenTexts.has(key)) {
        continue;
      }
      seenTexts.add(key);
      const detail: ScrapedReviewDetail = {
        id: reviewId,
        text,
        rating: typeof value.rate === "number" ? value.rate : undefined
      };
      const createdAt = extractReviewCreatedAt(value);
      if (createdAt) {
        detail.created_at = createdAt;
      }
      details.push(detail);
    }
  }

  return details;
}

function collectReviewCommentsById(values: ReviewComment[]): string[] {
  return collectReviewDetailsById(values).map((review) => review.text);
}

function collectReviewStrings(payload: unknown, seen = new Set<unknown>()): string[] {
  if (!payload || seen.has(payload)) {
    return [];
  }

  if (typeof payload === "string") {
    const normalized = payload.replace(/\s+/g, " ").trim();
    return normalized.length > 20 ? [normalized] : [];
  }

  if (typeof payload !== "object") {
    return [];
  }

  seen.add(payload);

  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => collectReviewStrings(entry, seen));
  }

  const record = payload as Record<string, unknown>;
  const directReview =
    (typeof record.comment === "string" && record.comment) ||
    (typeof record.reviewText === "string" && record.reviewText) ||
    (typeof record.text === "string" && record.text) ||
    (typeof record.content === "string" && record.content);

  const nested = Object.values(record).flatMap((entry) => collectReviewStrings(entry, seen));
  return directReview ? [directReview, ...nested] : nested;
}

async function fetchReviewApiPayload(productId: string): Promise<ReviewApiPayload> {
  try {
    const response = await fetch(`${REVIEW_API_BASE}/${productId}`, {
      credentials: "omit"
    });

    if (!response.ok) {
      return { reviews: [] };
    }

    const payload = await response.json();
    const reviews = uniqueTexts(collectReviewStrings(payload));

    let rating = 0;
    const ratingCandidates = [
      payload?.result?.averageRating,
      payload?.result?.rating,
      payload?.averageRating,
      payload?.rating
    ];

    for (const candidate of ratingCandidates) {
      if (typeof candidate === "number" && candidate > 0) {
        rating = candidate;
        break;
      }
    }

    return { rating, reviews };
  } catch (error) {
    console.warn("[BiBak] Trendyol review API failed", error);
    return { reviews: [] };
  }
}

async function fetchPriceHistoryPayload(
  listingIds: string[],
  contentId: string | null,
  currentPrice: number | null
): Promise<ExternalPriceHistory | undefined> {
  if (listingIds.length === 0 || !contentId) {
    return undefined;
  }

  const candidates: Array<ExternalPriceHistory & { latestPrice?: number; score: number }> = [];

  for (const listingId of listingIds.slice(0, 12)) {
    try {
      const url = new URL(PRICE_HISTORY_API_BASE);
      url.searchParams.set("listingId", listingId);
      url.searchParams.set("contentId", contentId);
      url.searchParams.set("culture", "tr-TR");
      url.searchParams.set("channelId", "1");
      url.searchParams.set("storefrontId", "1");

      const response = await fetch(url.toString(), {
        credentials: "omit"
      });
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as TrendyolPriceHistoryResponse;
      const prices = Object.fromEntries(
        Object.entries(payload.prices ?? {})
          .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      );

      if (Object.keys(prices).length === 0) {
        continue;
      }

      const datedEntries = Object.entries(prices).sort(([left], [right]) => left.localeCompare(right));
      const latestPrice = datedEntries.at(-1)?.[1];
      const position = listingIds.indexOf(listingId);
      const distancePenalty = currentPrice && latestPrice
        ? Math.min(35, Math.abs(latestPrice - currentPrice) / currentPrice * 35)
        : 12;
      const score = Math.max(0, 100 - position * 3 - distancePenalty + Math.min(10, datedEntries.length));
      candidates.push({
        source: "trendyol_internal",
        listingId,
        contentId,
        candidatesChecked: Math.min(listingIds.length, 12),
        selectedReason: currentPrice ? "closest_latest_history_to_live_price" : "first_ranked_listing_with_history",
        latestPrice,
        score,
        prices
      });
    } catch (error) {
      console.warn("[BiBak] Trendyol price history fetch failed", { listingId, error });
    }
  }

  const selected = candidates.sort((left, right) => right.score - left.score)[0];
  if (!selected) return undefined;

  const { latestPrice: _latestPrice, score: _score, ...history } = selected;
  return history;
}

async function fetchDetailedReviewsPayload(productId: string, targetCount = TARGET_REVIEW_COUNT): Promise<DetailedReviewApiPayload> {
  try {
    const reviews: string[] = [];
    const reviewDetails: ScrapedReviewDetail[] = [];
    let rating = 0;
    let totalPages = 1;
    const pagesToFetch = Math.max(1, Math.ceil(targetCount / 20));

    for (let page = 0; page < pagesToFetch && page < totalPages && reviews.length < targetCount; page += 1) {
      const url = new URL(REVIEW_DETAIL_API_BASE);
      url.searchParams.set("contentId", productId);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", "20");

      const response = await fetch(url.toString(), {
        credentials: "include"
      });

      if (!response.ok) {
        break;
      }

      const payload = await response.json();
      const result = payload?.result;
      if (!result) {
        break;
      }

      const pageReviews = Array.isArray(result.reviews)
        ? collectReviewDetailsById(result.reviews as ReviewComment[])
        : [];

      for (const review of pageReviews) {
        if (reviews.length >= targetCount) {
          break;
        }
        reviews.push(review.text);
        reviewDetails.push(review);
      }

      const averageRating = result.summary?.averageRating;
      if (typeof averageRating === "number" && averageRating > 0) {
        rating = averageRating;
      }

      const summaryTotalPages = result.summary?.totalPages;
      if (typeof summaryTotalPages === "number" && summaryTotalPages > 0) {
        totalPages = summaryTotalPages;
      }
    }

    return {
      rating,
      totalPages,
      reviews,
      reviewDetails
    };
  } catch (error) {
    console.warn("[BiBak] Trendyol detailed reviews API failed", error);
    return { reviews: [] };
  }
}

async function fetchReviewDetailPayload(): Promise<ReviewDetailPayload> {
  try {
    const reviewPageUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/yorumlar`;
    const response = await fetch(reviewPageUrl, {
      credentials: "omit"
    });

    if (!response.ok) {
      return { reviews: [] };
    }

    const html = await response.text();
    const payload = extractAssignedJson<ReviewDetailPageProps>(html, "review-detail");
    if (!payload) {
      return { reviews: [] };
    }

    return {
      rating: payload.product?.ratingScore?.averageRating ?? 0,
      reviewCount: payload.product?.ratingScore?.commentCount ?? 0,
      reviews: uniqueTexts(
        (payload.reviewImages?.content ?? [])
          .map((entry) => entry.comment ?? "")
          .filter(Boolean)
      )
    };
  } catch (error) {
    console.warn("[BiBak] Trendyol review detail page fallback failed", error);
    return { reviews: [] };
  }
}

function extractTitle(): string {
  const structuredData = getStructuredProductData();
  if (structuredData?.name) {
    return cleanTitle(structuredData.name);
  }

  const titleFromDom = extractText(queryAll(SELECTORS.title));
  if (titleFromDom) {
    return cleanTitle(titleFromDom);
  }

  const metaTitle = getMetaContent("meta[property='og:title']");
  if (metaTitle) {
    return cleanTitle(metaTitle);
  }

  return cleanTitle(document.title || "");
}

function extractPrice(): PriceExtraction {
  const productRoot = getProductDetailRoot();
  const direct = pickPrice(getVisibleCandidates(SELECTORS.price, productRoot));

  if (direct.text && hasBasketSalePrice(direct.text)) {
    return direct;
  }

  const basketPrice = pickPrice(getBasketPriceCandidates(productRoot));
  if (basketPrice.text) {
    return basketPrice;
  }

  if (direct.text) {
    return direct;
  }

  const dataLayerPrice = getProductPriceFromDataLayer();
  if (dataLayerPrice.text) {
    return dataLayerPrice;
  }

  const structuredData = getStructuredProductData();
  const structuredPrice = formatPrice(structuredData?.offers?.price, structuredData?.offers?.priceCurrency);
  if (structuredPrice) {
    return { text: structuredPrice, value: parsePriceValue(structuredPrice), selector: "structured_data.offers.price" };
  }

  return { text: "", value: null, selector: "" };
}

function extractSeller(): string {
  const merchantFromScripts = getMerchantFromPageScripts();
  if (merchantFromScripts) {
    return merchantFromScripts;
  }

  const props = getWindowProps<Record<string, unknown>>("envoy_product-info");
  const sellerFromProps = typeof props?.sellerName === "string" ? props.sellerName : "";
  if (sellerFromProps) {
    return sellerFromProps.trim();
  }

  const candidates = getVisibleCandidates(SELECTORS.seller);
  return pickSeller(candidates.map((candidate) => candidate.text));
}

function parseTurkishCompactNumber(value: string): number | undefined {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([bmk])?/i);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const suffix = match[2]?.toLocaleLowerCase("tr-TR");
  const multiplier = suffix === "m" ? 1_000_000 : suffix === "b" || suffix === "k" ? 1_000 : 1;
  return Math.round(amount * multiplier);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSellerScore(value: string): number | undefined {
  const match = value.trim().match(/^(10|[1-9](?:[,.]\d)?)$/);
  if (!match) {
    return undefined;
  }

  const score = Number(match[1].replace(",", "."));
  return Number.isFinite(score) && score >= 0 && score <= 10 ? score : undefined;
}

function extractMarketplaceSellerScore(sellerName?: string): number | undefined {
  const sellerInfo = document.querySelector(".seller-info");
  const scoreElement = sellerInfo?.querySelector("[data-testid='score-badge'], .score-badge")
    ?? document.querySelector("[data-testid='score-badge'], .score-badge");
  const scoreFromElement = scoreElement ? parseSellerScore(extractText(scoreElement)) : undefined;
  if (scoreFromElement !== undefined) {
    return scoreFromElement;
  }

  const bodyText = document.body.innerText || "";
  const sellerPattern = sellerName ? escapeRegex(sellerName) : "Satıcı";
  const focusedMatch = bodyText.match(new RegExp(`${sellerPattern}\\s+(10|[1-9](?:[,.]\\d)?)\\s+(?:[\\d,.]+\\s*[BMK]?\\s*)?Takipçi`, "i"));
  const explicitMatch = bodyText.match(/(?:Satıcı Puanı|Satıcı puanı|seller score)\D*(10|[1-9](?:[,.]\d)?)/i);

  return parseSellerScore(focusedMatch?.[1] ?? explicitMatch?.[1] ?? "");
}

function extractSellerMetadata(seller: string): SellerMetadata {
  const bodyText = document.body.innerText || "";
  const sellerName = seller && seller !== "N/A" ? seller : undefined;
  const verifiedTextPattern = /onaylı satıcı|doğrulanmış satıcı|dogrulanmis satici|resmi satıcı|resmi mağaza|verified seller|official store/i;
  const verifiedIconAvailable = Array.from(document.querySelectorAll("[class*='verified'], [class*='verify'], [class*='official'], [data-testid*='verified'], [data-testid*='official'], [aria-label*='Onay'], [aria-label*='Verified']"))
    .some((element) => isVisibleElement(element));
  const sellerBadges = Array.from(
    new Set(
      [
        ...Array.from(document.querySelectorAll("[class*='badge'], [class*='seller'], [class*='merchant'], [data-testid*='seller'], [data-testid*='merchant']"))
          .map((element) => extractText(element))
          .filter((text) => text.length > 0 && text.length <= 80),
        bodyText.includes("Hızlı Satıcı") ? "Hızlı Satıcı" : "",
        bodyText.includes("Kargo Bedava") ? "Kargo Bedava" : "",
        verifiedTextPattern.test(bodyText) || verifiedIconAvailable ? "Doğrulanmış Satıcı" : ""
      ]
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  ).slice(0, 12);

  const marketplaceSellerScore = extractMarketplaceSellerScore(sellerName);
  const followerMatch = bodyText.match(/(\d+(?:[,.]\d+)?)\s*([BMK])?\s*Takipçi/i);
  const storeLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .find((link) => {
      const text = extractText(link);
      const href = link.href || "";
      return text.includes("MAĞAZAYA GİT") || (!!sellerName && text.includes(sellerName)) || href.includes("/magaza/");
    });

  return {
    seller_name: sellerName,
    marketplace_seller_score: marketplaceSellerScore,
    seller_follower_count: followerMatch ? parseTurkishCompactNumber(`${followerMatch[1]}${followerMatch[2] ?? ""}`) : undefined,
    seller_badges: sellerBadges,
    verified_badge_available: verifiedTextPattern.test(bodyText) || verifiedIconAvailable,
    fast_delivery_available: /hızlı teslimat|hızlı satıcı|yarın kargoda|en geç yarın/i.test(bodyText),
    free_shipping_available: /kargo bedava|ücretsiz kargo/i.test(bodyText),
    store_url: storeLink?.href
  };
}

function extractRatingFromDom(): number {
  const structuredData = getStructuredProductData();
  const structuredRating = structuredData?.aggregateRating?.ratingValue;
  if (typeof structuredRating === "number" && structuredRating > 0) {
    return structuredRating;
  }
  if (typeof structuredRating === "string" && structuredRating.trim()) {
    return extractNumber(structuredRating);
  }

  const ratingText = extractText(queryAll(SELECTORS.rating));
  return ratingText ? extractNumber(ratingText) : 0;
}

function extractReviewsFromDom(): string[] {
  const structuredReviews = uniqueTexts(getStructuredReviewDetails().map((review) => review.text));
  if (structuredReviews.length > 0) {
    return structuredReviews;
  }

  const texts: string[] = [];

  document.querySelectorAll(SELECTORS.reviews.join(", ")).forEach((element) => {
    const text = extractText(element);
    if (text) {
      texts.push(text);
    }
  });

  return uniqueTexts(texts);
}

function resolveReviewSource(
  detailedReviewPayload: DetailedReviewApiPayload,
  reviewApiPayload: ReviewApiPayload,
  reviewDetailPayload: ReviewDetailPayload,
  reviews: string[]
): ScrapeSource {
  if (detailedReviewPayload.reviews.length > 0) {
    return "trendyol_detailed_api";
  }

  if (reviewApiPayload.reviews.length > 0) {
    return "trendyol_review_api";
  }

  if (reviewDetailPayload.reviews.length > 0) {
    return "trendyol_review_page";
  }

  return reviews.length > 0 ? "dom" : "fallback";
}

function buildMetadata(
  product: Omit<ScrapedProduct, "metadata">,
  productId: string | null,
  listingId: string | null,
  source: ScrapeSource,
  diagnostics?: ScrapeMetadata["diagnostics"]
): ScrapeMetadata {
  const missingFields: MissingProductField[] = [];
  const warnings: ScrapeWarning[] = [];

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
    warnings.push("no_reviews");
  } else if (product.reviews.length < LOW_REVIEW_COUNT_THRESHOLD) {
    warnings.push("low_review_count");
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
    listingId: listingId ?? undefined,
    source,
    diagnostics,
    confidence,
    reviewCount: product.reviews.length,
    missingFields,
    warnings
  };
}

export class TrendyolScraper implements Scraper {
  canHandle(url: string): boolean {
    return url.includes("trendyol.com");
  }

  async scrape(): Promise<ScrapedProduct> {
    console.log("[BiBak] Starting Trendyol scrape...");

    await waitForElement("body", 5000);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const productId = extractProductIdFromUrl(window.location.href);
    const listingIds = extractListingIds(productId);
    const detailedReviewPayload = productId ? await fetchDetailedReviewsPayload(productId) : { reviews: [] };
    const reviewApiPayload =
      detailedReviewPayload.reviews.length > 0
        ? { rating: detailedReviewPayload.rating, reviews: detailedReviewPayload.reviews }
        : productId
          ? await fetchReviewApiPayload(productId)
          : { reviews: [] };
    const reviewDetailPayload =
      reviewApiPayload.reviews.length === 0 && !reviewApiPayload.rating
        ? await fetchReviewDetailPayload()
        : { reviews: [] as string[], rating: 0, reviewCount: 0 };
    const title = extractTitle();
    const price = extractPrice();
    const priceHistory = await fetchPriceHistoryPayload(listingIds, productId, price.value);
    const listingId = priceHistory?.listingId ?? listingIds[0] ?? null;
    const seller = extractSeller();
    const sellerMetadata = extractSellerMetadata(seller);
    const reviews =
      reviewApiPayload.reviews.length > 0
        ? reviewApiPayload.reviews
        : reviewDetailPayload.reviews.length > 0
          ? reviewDetailPayload.reviews
          : extractReviewsFromDom();
    const rating = reviewApiPayload.rating || reviewDetailPayload.rating || extractRatingFromDom();
    const reviewDetails = enrichReviewDetailsWithStructuredDates(
      detailedReviewPayload.reviewDetails?.length
        ? detailedReviewPayload.reviewDetails
        : getStructuredReviewDetails().length > 0
          ? getStructuredReviewDetails()
          : reviews.map((review) => ({ text: review, rating: rating || undefined }))
    );
    const source = resolveReviewSource(detailedReviewPayload, reviewApiPayload, reviewDetailPayload, reviews);

    const product = {
      title,
      price: price.text || "N/A",
      seller: seller || "N/A",
      reviews,
      reviewDetails,
      rating,
      platform: "trendyol",
      sellerMetadata
    } satisfies Omit<ScrapedProduct, "metadata">;

    const scraped: ScrapedProduct = {
      ...product,
      metadata: buildMetadata(product, productId, listingId, source, {
        priceText: price.text || undefined,
        parsedPrice: price.value,
        priceSelector: price.selector || undefined,
        selectedListingId: listingId,
        contentId: productId,
        historySource: priceHistory?.source,
        historyCount: priceHistory ? Object.keys(priceHistory.prices).length : 0,
        historyCandidatesChecked: priceHistory?.candidatesChecked ?? Math.min(listingIds.length, 12),
        historySelectionReason: priceHistory?.selectedReason
      }),
      priceHistory
    };

    console.log("[BiBak] Scraped Trendyol data:", {
      title: scraped.title,
      price: scraped.price,
      seller: scraped.seller,
      rating: scraped.rating,
      reviewsCount: scraped.reviews.length,
      listingIdsChecked: listingIds.length,
      priceHistoryCount: scraped.priceHistory ? Object.keys(scraped.priceHistory.prices).length : 0,
      sellerMetadata: scraped.sellerMetadata,
      metadata: scraped.metadata,
      reviewSample: scraped.reviews.slice(0, 3),
      reviewDetailsSample: scraped.reviewDetails?.slice(0, 3)
    });

    if (!scraped.title && scraped.reviews.length === 0) {
      throw new Error("Trendyol product data could not be extracted");
    }

    return scraped;
  }
}
