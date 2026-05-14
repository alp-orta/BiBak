import { ScrapedProduct, Scraper, type MissingProductField, type ScrapeMetadata, type ScrapeSource, type ScrapeWarning } from "./index";
import { queryAll, extractText, extractNumber, waitForElement } from "./utils";

const SELECTORS = {
  title: [
    "h1",
    "[data-testid='product-name']",
    "[data-testid*='product-name']",
    "meta[property='og:title']"
  ],
  price: [
    "[data-testid='price-current-price']",
    "[data-testid*='price']",
    "[class*='price']",
    "[class*='prc']"
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
};

type DetailedReviewApiPayload = {
  rating?: number;
  totalPages?: number;
  reviews: string[];
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

function getWindowProps<T>(name: string): T | null {
  return ((window as unknown) as Record<string, T | undefined>)[`__${name}__PROPS`] ?? null;
}

function extractProductIdFromUrl(url: string): string | null {
  const match = url.match(/-p-(\d+)/i);
  return match?.[1] ?? null;
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

function getVisibleCandidates(selectors: string[]): string[] {
  const texts = new Set<string>();

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((element) => {
      const text = extractText(element);
      if (text) {
        texts.add(text);
      }
    });
  }

  return Array.from(texts);
}

function pickPrice(candidates: string[]): string {
  return candidates.find((candidate) => PRICE_PATTERN.test(candidate)) ?? "";
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

function collectReviewCommentsById(values: ReviewComment[]): string[] {
  const seenIds = new Set<number>();
  const texts: string[] = [];

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
      texts.push(text);
    }
  }

  return texts;
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

async function fetchDetailedReviewsPayload(productId: string, targetCount = TARGET_REVIEW_COUNT): Promise<DetailedReviewApiPayload> {
  try {
    const reviews: string[] = [];
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
        ? collectReviewCommentsById(result.reviews as ReviewComment[])
        : [];

      for (const review of pageReviews) {
        if (reviews.length >= targetCount) {
          break;
        }
        reviews.push(review);
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
      reviews
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

function extractPrice(): string {
  const structuredData = getStructuredProductData();
  const structuredPrice = formatPrice(structuredData?.offers?.price, structuredData?.offers?.priceCurrency);
  if (structuredPrice) {
    return structuredPrice;
  }

  const candidates = getVisibleCandidates(SELECTORS.price);
  const direct = pickPrice(candidates);
  if (direct) {
    return direct;
  }

  const bodyText = document.body?.innerText ?? "";
  const match = bodyText.match(PRICE_PATTERN);
  return match?.[0]?.trim() ?? "";
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
  return pickSeller(candidates);
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
  const structuredData = getStructuredProductData();
  const structuredReviews = uniqueTexts(
    (structuredData?.review ?? [])
      .map((review) => review.reviewBody ?? "")
      .filter(Boolean)
  );
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

function buildMetadata(product: Omit<ScrapedProduct, "metadata">, productId: string | null, source: ScrapeSource): ScrapeMetadata {
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
    source,
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
    const seller = extractSeller();
    const reviews =
      reviewApiPayload.reviews.length > 0
        ? reviewApiPayload.reviews
        : reviewDetailPayload.reviews.length > 0
          ? reviewDetailPayload.reviews
          : extractReviewsFromDom();
    const rating = reviewApiPayload.rating || reviewDetailPayload.rating || extractRatingFromDom();
    const source = resolveReviewSource(detailedReviewPayload, reviewApiPayload, reviewDetailPayload, reviews);

    const product = {
      title,
      price: price || "N/A",
      seller: seller || "N/A",
      reviews,
      rating,
      platform: "trendyol"
    } satisfies Omit<ScrapedProduct, "metadata">;

    const scraped: ScrapedProduct = {
      ...product,
      metadata: buildMetadata(product, productId, source)
    };

    console.log("[BiBak] Scraped Trendyol data:", {
      title: scraped.title,
      price: scraped.price,
      seller: scraped.seller,
      rating: scraped.rating,
      reviewsCount: scraped.reviews.length,
      metadata: scraped.metadata,
      reviewSample: scraped.reviews.slice(0, 3)
    });

    if (!scraped.title && scraped.reviews.length === 0) {
      throw new Error("Trendyol product data could not be extracted");
    }

    return scraped;
  }
}
