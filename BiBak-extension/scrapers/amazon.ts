import {
  ScrapedProduct,
  Scraper,
  type ExternalPriceHistory,
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
    "#productTitle",
    "h1#title",
    "h1",
    "meta[property='og:title']"
  ],
  price: [
    "#price_inside_buybox",
    "#newBuyBoxPrice",
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#corePrice_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    ".a-price[data-a-color='price'] .a-offscreen",
    ".a-price .a-offscreen"
  ],
  seller: [
    "#sellerProfileTriggerId",
    "#merchant-info a",
    "#merchant-info",
    "#tabular-buybox [tabular-attribute-name='Satıcı'] .tabular-buybox-text",
    "#tabular-buybox [tabular-attribute-name='Sold by'] .tabular-buybox-text",
    "#seller-info a"
  ],
  rating: [
    "#acrPopover .a-icon-alt",
    "#acrPopover span.a-size-base",
    "[data-hook='rating-out-of-text']",
    ".reviewCountTextLinkedHistogram .a-icon-alt",
    ".a-icon-star .a-icon-alt"
  ],
  reviews: [
    "[data-hook='reviewRichContentContainer']",
    "[data-hook='review-body'] span",
    "[data-hook='reviewText']",
    ".review-text-content span",
    ".review-text"
  ]
};

const TARGET_REVIEW_COUNT = 100;
const LOW_REVIEW_COUNT_THRESHOLD = 5;
const OFFER_IFRAME_TIMEOUT_MS = 7000;
const AMAZON_PRICE_PATTERN = /(?:₺\s*[\d.,]+|[\d.,]+\s*(?:TL|₺)|\$\s*[\d.,]+|[\d.,]+\s*(?:USD|EUR|GBP))/i;

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
    availability?: string;
  } | Array<{
    price?: string | number;
    priceCurrency?: string;
    seller?: {
      name?: string;
    };
    availability?: string;
  }>;
  aggregateRating?: {
    ratingValue?: string | number;
    reviewCount?: string | number;
    ratingCount?: string | number;
  };
  review?: Array<{
    "@type"?: string;
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

type OfferListingPayload = {
  price: PriceExtraction;
  seller: string;
  sellerMetadata: SellerMetadata;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeReviewKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
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

function extractAsinFromUrl(url: string): string | null {
  return url.match(/\/(?:dp|gp\/product|product-reviews|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1] ?? null;
}

function getCanonicalProductId(): string | null {
  const asinFromUrl = extractAsinFromUrl(window.location.href);
  if (asinFromUrl) {
    return asinFromUrl;
  }

  const asinInputs = ["#ASIN", "input[name='ASIN']", "input[name='asin']"];
  for (const selector of asinInputs) {
    const value = document.querySelector<HTMLInputElement>(selector)?.value?.trim();
    if (value && /^[A-Z0-9]{10}$/i.test(value)) {
      return value;
    }
  }

  const structured = getStructuredProductData();
  for (const candidate of [structured?.sku, structured?.productID]) {
    if (candidate && /^[A-Z0-9]{10}$/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
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

export function parsePriceValue(value: string): number | null {
  const number = value.replace(/[^\d.,]/g, "");
  if (!number) {
    return null;
  }

  const hasComma = number.includes(",");
  const hasDot = number.includes(".");

  if (hasComma && hasDot) {
    const lastComma = number.lastIndexOf(",");
    const lastDot = number.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    const normalized = number
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (hasComma) {
    const parts = number.split(",");
    if (parts.length > 1 && parts.at(-1)?.length === 3) {
      const parsed = Number(number.replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    } else {
      const parsed = Number(number.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  if (hasDot) {
    const parts = number.split(".");
    if (parts.length > 1 && parts.at(-1)?.length === 3) {
      const parsed = Number(number.replace(/\./g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    } else {
      const parsed = Number(number);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  const parsed = Number(number);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: string | number | undefined, currency: string | undefined): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) {
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

export function extractScopedPriceCandidates(root: ParentNode = document): Array<{
  text: string;
  value: number;
  selector: string;
  score: number;
  reason: string;
}> {
  const candidates: Array<{
    text: string;
    value: number;
    selector: string;
    score: number;
    reason: string;
  }> = [];

  const selectorRatings = [
    { selector: "#price_inside_buybox", baseScore: 100, reason: "buybox_inside_price" },
    { selector: "#newBuyBoxPrice", baseScore: 95, reason: "new_buybox_price" },
    { selector: "#buybox_feature_div .a-price:not(.a-text-price) .a-offscreen", baseScore: 90, reason: "buybox_feature_price" },
    { selector: "#buybox .a-price:not(.a-text-price) .a-offscreen", baseScore: 90, reason: "buybox_price" },
    { selector: "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen", baseScore: 85, reason: "core_price_display" },
    { selector: "#corePrice_desktop .a-price:not(.a-text-price) .a-offscreen", baseScore: 85, reason: "core_price_desktop" },
    { selector: "#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen", baseScore: 80, reason: "core_price_feature" },
    { selector: "#apex_desktop .a-price:not(.a-text-price) .a-offscreen", baseScore: 75, reason: "apex_desktop_price" },
    { selector: "#priceblock_ourprice", baseScore: 70, reason: "priceblock_ourprice" },
    { selector: "#priceblock_dealprice", baseScore: 70, reason: "priceblock_dealprice" },
    { selector: "#priceblock_saleprice", baseScore: 70, reason: "priceblock_saleprice" },
    { selector: ".a-price:not(.a-text-price) .a-offscreen", baseScore: 50, reason: "generic_offscreen_price" }
  ];

  for (const { selector, baseScore, reason } of selectorRatings) {
    const elements = root.querySelectorAll(selector);
    elements.forEach((element) => {
      if (!isVisibleElement(element)) {
        return;
      }

      let isCrossedOut = false;
      let isUnitPrice = false;
      let isInstallment = false;
      let isCoupon = false;

      let current: Element | null = element;
      while (current && current !== document.body) {
        if (!current) break;
        const classes = current.className || "";
        const style = window.getComputedStyle(current);
        if (
          classes.includes("a-text-price") ||
          classes.includes("basisPrice") ||
          classes.includes("listPrice") ||
          classes.includes("a-price-range") ||
          style.textDecoration.includes("line-through")
        ) {
          isCrossedOut = true;
        }
        if (classes.includes("a-price-unit") || classes.includes("unitLine")) {
          isUnitPrice = true;
        }
        if (classes.includes("installment") || classes.includes("financing") || classes.includes("twisterSwatchPrice")) {
          isInstallment = true;
        }
        if (classes.includes("coupon") || classes.includes("promo")) {
          isCoupon = true;
        }
        current = current.parentElement;
      }

      const rawText = normalizeText(extractText(element));
      const value = parsePriceValue(rawText);
      if (value === null || value <= 0) {
        return;
      }

      let score = baseScore;
      if (isCrossedOut) {
        score -= 150;
      }
      if (isUnitPrice) {
        score -= 90;
      }
      if (isInstallment) {
        score -= 70;
      }
      if (isCoupon) {
        score -= 50;
      }

      const textLower = rawText.toLowerCase();
      if (
        textLower.includes("/") ||
        textLower.includes("per") ||
        textLower.includes("adet") ||
        textLower.includes("kapsül") ||
        textLower.includes("tablet") ||
        textLower.includes("piece") ||
        textLower.includes("count") ||
        textLower.includes("g/b")
      ) {
        score -= 90;
      }
      if (
        textLower.includes("taksit") ||
        textLower.includes("x") ||
        textLower.includes("aylık") ||
        textLower.includes("installment") ||
        textLower.includes("vade")
      ) {
        score -= 70;
      }
      if (
        textLower.includes("kargo") ||
        textLower.includes("shipping") ||
        textLower.includes("teslimat") ||
        textLower.includes("delivery")
      ) {
        score -= 80;
      }

      candidates.push({
        text: rawText,
        value,
        selector,
        score,
        reason
      });
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function pickPrice(candidates: Array<{ text: string; value: number; selector: string; score: number; reason: string }>): PriceExtraction {
  const best = candidates.find((c) => c.score > 0);
  if (best) {
    return { text: best.text, value: best.value, selector: `${best.selector} (${best.reason})` };
  }

  return { text: "", value: null, selector: "" };
}

export function getStructuredOffer(): PriceExtraction {
  const structured = getStructuredProductData();
  const offers = Array.isArray(structured?.offers) ? structured?.offers : structured?.offers ? [structured.offers] : [];

  for (const offer of offers) {
    const text = formatPrice(offer.price, offer.priceCurrency);
    if (text) {
      return { text, value: parsePriceValue(text), selector: "structured_data.offers.price" };
    }
  }

  return { text: "", value: null, selector: "" };
}

export function getVariantStartingPrice(): PriceExtraction {
  const candidates: Array<{ text: string; value: number; selector: string; score: number; reason: string }> = [];
  document.querySelectorAll("[role='radio'], .twisterSwatchWrapper, #variation_size_name li, #variation_color_name li").forEach((element) => {
    if (!isVisibleElement(element)) return;
    const text = normalizeText(extractText(element));
    const value = parsePriceValue(text);
    if (value && value > 0) {
      candidates.push({ text, value, selector: "variation_price_text", score: 30, reason: "swatch_variation_element" });
    }
  });

  return pickPrice(candidates);
}

export function getPriceFromPageText(): PriceExtraction {
  const bodyText = normalizeText(document.body?.innerText ?? "");
  const focusedPatterns = [
    /(?:fiyattan başlayan|starting at|from)\s*[:\-]?\s*((?:₺\s*)?[\d.,]+\s*(?:TL|₺))/i,
    /((?:₺\s*)?[\d.,]+\s*(?:TL|₺))\s*(?:fiyattan başlayan|starting at|from)/i,
    /(?:Fiyat|Price)\s*[:\-]?\s*((?:₺\s*)?[\d.,]+\s*(?:TL|₺)?)/i
  ];

  for (const pattern of focusedPatterns) {
    const match = bodyText.match(pattern);
    const text = match?.[1]?.trim();
    if (text) {
      const value = parsePriceValue(text);
      if (value && value > 0) {
        return { text, value, selector: "visible_text:price_fallback" };
      }
    }
  }

  return { text: "", value: null, selector: "" };
}

export function extractPrice(): { price: PriceExtraction; candidatesChecked: number } {
  const scopedCandidates = extractScopedPriceCandidates();
  let candidatesCount = scopedCandidates.length;

  const direct = pickPrice(scopedCandidates);
  if (direct.text && direct.value && direct.value > 0) {
    return { price: direct, candidatesChecked: candidatesCount };
  }

  const structured = getStructuredOffer();
  if (structured.text) {
    candidatesCount += 1;
    return { price: structured, candidatesChecked: candidatesCount };
  }

  const variant = getVariantStartingPrice();
  if (variant.text) {
    candidatesCount += 1;
    return { price: variant, candidatesChecked: candidatesCount };
  }

  const textPrice = getPriceFromPageText();
  if (textPrice.text) {
    candidatesCount += 1;
    return { price: textPrice, candidatesChecked: candidatesCount };
  }

  return { price: { text: "", value: null, selector: "" }, candidatesChecked: candidatesCount };
}

export function extractAmazonIdentities(): {
  asin: string | null;
  selectedListingId: string | null;
  merchantId: string | null;
  offerListingId: string | null;
} {
  const asin = getCanonicalProductId();
  let offerListingId: string | null = null;
  let merchantId: string | null = null;

  // Try extracting offerListingId
  const offerInputs = ["input[name='offerListingID']", "input#offerListingID", "input[name='oid']", "input#oid"];
  for (const selector of offerInputs) {
    const val = document.querySelector<HTMLInputElement>(selector)?.value?.trim();
    if (val) {
      offerListingId = val;
      break;
    }
  }

  // Try extracting merchantId
  const merchantInputs = ["input[name='merchantID']", "input#merchantID", "input[name='sellerID']", "input#sellerID"];
  for (const selector of merchantInputs) {
    const val = document.querySelector<HTMLInputElement>(selector)?.value?.trim();
    if (val) {
      merchantId = val;
      break;
    }
  }

  if (!merchantId) {
    const sellerLinks = document.querySelectorAll<HTMLAnchorElement>(
      "#sellerProfileTriggerId[href], #merchant-info a[href], #aod-offer-soldBy a[href], .aod-seller-link[href]"
    );
    for (const link of Array.from(sellerLinks)) {
      const href = link.href || "";
      const match = href.match(/[?&](?:seller|merchant|merchantId)=([A-Z0-9]{10,25})/i);
      if (match?.[1]) {
        merchantId = match[1];
        break;
      }
    }
  }

  // Determine selectedListingId
  let selectedListingId = offerListingId;
  if (!selectedListingId && asin) {
    if (merchantId) {
      selectedListingId = `${asin}_${merchantId}`;
    } else {
      const activeSwatch = document.querySelector(".swatchSelect, li.swatchSelect, .selected, [aria-checked='true']");
      const swatchId = activeSwatch?.getAttribute("id") || activeSwatch?.getAttribute("data-asin") || activeSwatch?.getAttribute("data-defaultasin");
      if (swatchId && swatchId !== asin) {
        selectedListingId = `${asin}_${swatchId}`;
      } else {
        selectedListingId = asin;
      }
    }
  }

  return {
    asin,
    selectedListingId,
    merchantId,
    offerListingId
  };
}

function extractTitle(): string {
  const structured = getStructuredProductData();
  if (structured?.name) {
    return normalizeText(structured.name);
  }

  const title = normalizeText(extractText(queryAll(SELECTORS.title)));
  if (title) {
    return title.replace(/\s*:\s*Amazon\..*$/i, "").trim();
  }

  const metaTitle = getMetaContent("meta[property='og:title']");
  if (metaTitle) {
    return normalizeText(metaTitle).replace(/\s*:\s*Amazon\..*$/i, "").trim();
  }

  return normalizeText(document.title).replace(/\s*:\s*Amazon\..*$/i, "").trim();
}

function cleanSellerText(value: string): string {
  return normalizeText(value)
    .replace(/^Satıcı\s*/i, "")
    .replace(/^Sold by\s*/i, "")
    .replace(/^Gönderimi Sağlayan\s+Amazon\s*/i, "")
    .replace(/Satıcı puanı.*$/i, "")
    .replace(/Son 12 ay içinde.*$/i, "")
    .replace(/\bStore[’']?[uü]?\s+ziyaret edin$/i, "")
    .replace(/^Visit the .* Store$/i, "")
    .trim();
}

function pickSeller(candidates: string[]): string {
  for (const candidate of candidates) {
    const cleaned = cleanSellerText(candidate);
    if (
      cleaned &&
      cleaned.length <= 100 &&
      !AMAZON_PRICE_PATTERN.test(cleaned) &&
      !/\bStore[’']?[uü]?\s+ziyaret edin$/i.test(candidate) &&
      !/^Visit the .* Store$/i.test(candidate)
    ) {
      return cleaned;
    }
  }

  return "";
}

function extractSeller(): string {
  const structured = getStructuredProductData();
  const offers = Array.isArray(structured?.offers) ? structured?.offers : structured?.offers ? [structured.offers] : [];
  for (const offer of offers) {
    if (offer.seller?.name) {
      return offer.seller.name.trim();
    }
  }

  return pickSeller(getVisibleCandidates(SELECTORS.seller).map((candidate) => candidate.text));
}

function parseRating(value: string | number | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return 0;
  }

  const normalized = value.replace(/,/g, ".");
  const focused =
    normalized.match(/(?:üzerinden|out of)\s*(\d+(?:\.\d+)?)/i)?.[1]
    ?? normalized.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*5|out of 5|yıldız)/i)?.[1]
    ?? normalized.match(/(\d+(?:\.\d+)?)/)?.[1]
    ?? "";
  const parsed = Number(focused);

  return Number.isFinite(parsed) ? parsed : 0;
}

function extractRatingFromDom(): number {
  const structuredRating = getStructuredProductData()?.aggregateRating?.ratingValue;
  const structured = parseRating(structuredRating);
  if (structured > 0) {
    return structured;
  }

  const ratingText = extractText(queryAll(SELECTORS.rating));
  return ratingText ? parseRating(ratingText) : 0;
}

function uniqueTexts(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .map((value) => value
          .replace(/^Brief content visible, double tap to read full content\./i, "")
          .replace(/^Full content visible, double tap to read brief content\./i, "")
          .replace(/Daha fazla göster.*$/i, "")
          .replace(/Read more.*$/i, "")
          .trim()
        )
        .filter((value) => value.length > 15)
    )
  );
}

function getStructuredReviewDetails(): ScrapedReviewDetail[] {
  const structuredData = getStructuredProductData();
  return (structuredData?.review ?? [])
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

function extractReviewDetailsFromDom(root: ParentNode = document): ScrapedReviewDetail[] {
  const seen = new Set<string>();
  const reviewElements = Array.from(root.querySelectorAll("[data-hook='review'], [data-hook='reviewContainer']"));
  const details: ScrapedReviewDetail[] = [];

  for (const review of reviewElements) {
    const id = review.getAttribute("id") || undefined;
    const text = normalizeText(
      extractText(
        review.querySelector("[data-hook='reviewRichContentContainer']")
          ?? review.querySelector("[data-hook='review-body'] span")
          ?? review.querySelector("[data-hook='reviewText']")
      )
    )
      .replace(/^Brief content visible, double tap to read full content\./i, "")
      .replace(/^Full content visible, double tap to read brief content\./i, "")
      .replace(/Daha fazla göster.*$/i, "")
      .replace(/Read more.*$/i, "")
      .trim();

    if (text.length <= 15 || seen.has(text)) {
      continue;
    }

    seen.add(text);
    const ratingText = extractText(review.querySelector("[data-hook='review-star-rating'], [data-hook='cmps-review-star-rating'], .a-icon-star .a-icon-alt"));
    const rating = parseRating(ratingText);
    const createdAt = normalizeText(extractText(review.querySelector("[data-hook='review-date']")));
    details.push({
      id,
      text,
      rating: rating > 0 ? rating : undefined,
      created_at: createdAt || undefined
    });
  }

  if (details.length > 0) {
    return details;
  }

  // Fallback to simpler selectors if hook elements do not exist
  const simpleElements = root.querySelectorAll(SELECTORS.reviews.join(", "));
  simpleElements.forEach((element, index) => {
    const text = normalizeText(extractText(element))
      .replace(/^Brief content visible, double tap to read full content\./i, "")
      .replace(/^Full content visible, double tap to read brief content\./i, "")
      .replace(/Daha fazla göster.*$/i, "")
      .replace(/Read more.*$/i, "")
      .trim();
    if (text.length > 15 && !seen.has(text)) {
      seen.add(text);
      details.push({
        id: `dom-fallback-${index}`,
        text
      });
    }
  });

  if (details.length > 0) {
    return details;
  }

  return getStructuredReviewDetails();
}

function extractReviewsFromDom(): string[] {
  const details = extractReviewDetailsFromDom();
  if (details.length > 0) {
    return uniqueTexts(details.map((review) => review.text));
  }

  const texts: string[] = [];
  document.querySelectorAll(SELECTORS.reviews.join(", ")).forEach((element) => {
    const text = normalizeText(extractText(element));
    if (text) {
      texts.push(text);
    }
  });

  return uniqueTexts(texts);
}

async function scrollToLoadAmazonReviews(): Promise<void> {
  const reviewRootSelectors = [
    "#customerReviews",
    "#customer-reviews_feature_div",
    "#reviewsMedley",
    "[data-hook='cr-widget-FocalReviews']"
  ];

  for (const selector of reviewRootSelectors) {
    const root = document.querySelector(selector);
    if (root) {
      root.scrollIntoView({ block: "start", behavior: "smooth" });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (document.querySelectorAll("[data-hook='review'], [data-hook='reviewContainer']").length > 0) {
        return;
      }
    }
  }

  const maxScrolls = 10;
  for (let step = 0; step < maxScrolls && document.querySelectorAll("[data-hook='review'], [data-hook='reviewContainer']").length === 0; step += 1) {
    window.scrollBy({ top: Math.max(1200, window.innerHeight * 2), behavior: "smooth" });
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
}

function getReviewCountFromPage(fallback: number): number {
  const structuredCount = getStructuredProductData()?.aggregateRating?.reviewCount ?? getStructuredProductData()?.aggregateRating?.ratingCount;
  const parsedStructured = parseCount(structuredCount);
  if (parsedStructured > 0) {
    return parsedStructured;
  }

  const text = normalizeText(extractText(document.querySelector("#acrCustomerReviewText, [data-hook='total-review-count']")));
  const parsed = parseCount(text);
  return parsed > 0 ? parsed : fallback;
}

function parseCount(value: string | number | undefined): number {
  if (typeof value === "number") {
    return Math.round(value);
  }

  if (!value) {
    return 0;
  }

  const match = value.match(/[\d.,]+/);
  if (!match) {
    return 0;
  }

  const parsed = Number(match[0].replace(/[.,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function amazonOrigin(): string {
  return window.location.origin || "https://www.amazon.com.tr";
}

function waitForIframeLoad(iframe: HTMLIFrameElement, timeoutMs: number): Promise<Document | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        resolve(iframe.contentDocument);
      } catch {
        resolve(null);
      }
    };

    iframe.addEventListener("load", finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
}

async function loadSameOriginDocument(path: string, waitSelector?: string): Promise<Document | null> {
  const iframe = document.createElement("iframe");
  iframe.src = `${amazonOrigin()}${path}`;
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "-10000px";
  iframe.style.width = "1200px";
  iframe.style.height = "900px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.setAttribute("aria-hidden", "true");

  document.body.appendChild(iframe);
  try {
    const loaded = await waitForIframeLoad(iframe, OFFER_IFRAME_TIMEOUT_MS);
    if (!loaded) {
      return null;
    }

    const started = Date.now();
    while (Date.now() - started < OFFER_IFRAME_TIMEOUT_MS) {
      if (waitSelector ? loaded.querySelector(waitSelector) : normalizeText(loaded.body?.innerText ?? "").length > 500) {
        return loaded;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return loaded;
  } catch (error) {
    console.warn("[BiBak] Amazon hidden document load failed", error);
    return null;
  } finally {
    iframe.remove();
  }
}

async function fetchSameOriginDocument(path: string): Promise<Document | null> {
  try {
    const response = await fetch(`${amazonOrigin()}${path}`, {
      credentials: "include"
    });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  } catch (error) {
    console.warn("[BiBak] Amazon same-origin document fetch failed", error);
    return null;
  }
}

export function extractOfferListingPayload(root: ParentNode): OfferListingPayload {
  const offers = Array.from(root.querySelectorAll("#aod-pinned-offer, #aod-offer-list .aod-offer, #aod-offer"));
  
  let bestOfferNode: Element | null = null;
  let bestPrice: PriceExtraction = { text: "", value: null, selector: "" };
  let bestSeller = "";
  
  for (const node of offers) {
    const priceEl = node.querySelector(".a-price .a-offscreen, .a-price");
    const priceText = priceEl ? normalizeText(extractText(priceEl)) : "";
    const priceVal = parsePriceValue(priceText);
    
    const sellerEl = node.querySelector("#aod-offer-soldBy a, [id*='soldBy'] a, .aod-offer-soldBy a, .aod-seller-link, #sellerProfileTriggerId");
    const sellerName = sellerEl ? cleanSellerText(extractText(sellerEl)) : "";
    
    if (priceVal && priceVal > 0 && sellerName) {
      bestOfferNode = node;
      bestPrice = { text: priceText, value: priceVal, selector: "aod_offer_node" };
      bestSeller = sellerName;
      break;
    }
  }

  if (!bestOfferNode) {
    const pinnedOffer = root.querySelector("#aod-pinned-offer");
    const firstAodOffer = root.querySelector("#aod-offer-list .aod-offer, #aod-offer");
    bestOfferNode = (pinnedOffer || firstAodOffer || root) as Element;
  }

  const text = normalizeText((bestOfferNode as HTMLElement).innerText ?? bestOfferNode.textContent ?? (root as Document).body?.innerText ?? (root as Document).body?.textContent ?? "");
  
  if (!bestPrice.value) {
    const priceEl = bestOfferNode.querySelector(".a-price .a-offscreen, .a-price");
    const priceText = priceEl ? normalizeText(extractText(priceEl)) : "";
    bestPrice = { text: priceText, value: parsePriceValue(priceText), selector: "aod_fallback_price" };
  }
  
  if (!bestSeller) {
    const sellerEl = bestOfferNode.querySelector("#aod-offer-soldBy a, [id*='soldBy'] a, .aod-offer-soldBy a, .aod-seller-link, #sellerProfileTriggerId");
    bestSeller = sellerEl ? cleanSellerText(extractText(sellerEl)) : "";
  }
  if (!bestSeller) {
    const sellerMatch = text.match(/(?:Satıcı|Sold by)\s+(.+?)(?:Satıcı puanı|Seller rating|Ships from|Gönderimi|$)/i);
    bestSeller = sellerMatch ? cleanSellerText(sellerMatch[1]) : "";
  }

  const sellerLinkEl = bestOfferNode.querySelector<HTMLAnchorElement>("#aod-offer-soldBy a[href], [id*='soldBy'] a[href], .aod-offer-soldBy a[href], #sellerProfileTriggerId[href]");
  let storeUrl = sellerLinkEl?.href || undefined;
  if (storeUrl && storeUrl.startsWith("/")) {
    storeUrl = `${amazonOrigin()}${storeUrl}`;
  }

  const positiveRatioMatch = text.match(/(?:%(\d+)\s+pozitif|(\d+)%\s+positive)/i);
  const positiveRatio = positiveRatioMatch ? Number(positiveRatioMatch[1] || positiveRatioMatch[2]) : undefined;
  
  const scoreMatch = text.match(/(?:Satıcı puanı\s+5 yıldız üzerinden\s+([\d,.]+)|([\d,.]+)\s+out of 5 stars)/i);
  let score = scoreMatch ? parseRating(scoreMatch[1] || scoreMatch[2]) : undefined;
  if (!score && positiveRatio) {
    score = (positiveRatio / 100) * 5;
  }

  const ratingCountMatch = text.match(/\(([\d.,]+)\s+(?:derecelendirme|ratings?)\)/i);
  const ratingCount = ratingCountMatch ? Number(ratingCountMatch[1].replace(/[.,]/g, "")) : undefined;

  const isAmazonFulfilled = /Amazon tarafından gönderilir|Gönderimi Sağlayan\s*(?::)?\s*Amazon|Ships from Amazon|Fulfilled by Amazon/i.test(text);
  const isFreeDelivery = /ÜCRETSİZ teslimat|free delivery|free shipping|ücretsiz kargo/i.test(text);
  const isFastDelivery = /teslimat|delivery|tomorrow|yarın|hızlı|fast/i.test(text);

  const badges = [
    isAmazonFulfilled ? "Amazon fulfilled" : "",
    positiveRatio && positiveRatio >= 90 ? `${positiveRatio}% positive in last 12 months` : "",
    ratingCount ? `Rating Count: ${ratingCount.toLocaleString()} (stored in follower count)` : "",
    isFreeDelivery ? "Free shipping" : ""
  ].filter(Boolean);

  return {
    price: bestPrice,
    seller: bestSeller,
    sellerMetadata: {
      seller_name: bestSeller || undefined,
      marketplace_seller_score: score,
      seller_follower_count: ratingCount,
      seller_badges: badges,
      verified_badge_available: isAmazonFulfilled || bestSeller === "Amazon" || bestSeller === "Amazon.com.tr",
      fast_delivery_available: isFastDelivery,
      free_shipping_available: isFreeDelivery,
      store_url: storeUrl
    }
  };
}

async function fetchProductPageReviewDetails(asin: string | null): Promise<ScrapedReviewDetail[]> {
  const path = `${window.location.pathname}${window.location.search || ""}`;
  const candidatePaths = [
    path,
    asin ? `/dp/${asin}?th=1` : ""
  ].filter(Boolean);
  const seen = new Set<string>();
  const details: ScrapedReviewDetail[] = [];

  for (const candidatePath of candidatePaths) {
    const doc = await fetchSameOriginDocument(candidatePath);
    if (!doc) {
      continue;
    }

    for (const detail of extractReviewDetailsFromDom(doc)) {
      const key = normalizeReviewKey(detail.text);
      if (!seen.has(key)) {
        seen.add(key);
        details.push(detail);
      }
    }

    if (details.length > 0) {
      return details;
    }
  }

  return details;
}

async function fetchOfferListingPayload(asin: string | null): Promise<OfferListingPayload | null> {
  if (!asin || !document.body) {
    return null;
  }

  const path = `/dp/${asin}/ref=olp-opf-redir?aod=1&th=1`;
  const doc = await loadSameOriginDocument(path, "#aod-container");
  if (!doc) {
    return null;
  }

  const payload = extractOfferListingPayload(doc);
  return payload.price.text || payload.seller ? payload : null;
}

async function fetchReviewPageDetails(asin: string | null, targetCount = TARGET_REVIEW_COUNT): Promise<ScrapedReviewDetail[]> {
  if (!asin || !document.body) {
    return [];
  }

  const allDetails: ScrapedReviewDetail[] = [];
  const seen = new Set<string>();
  const pagesToFetch = Math.max(1, Math.ceil(targetCount / 10));

  for (let page = 1; page <= pagesToFetch && allDetails.length < targetCount; page += 1) {
    const doc = await loadSameOriginDocument(`/product-reviews/${asin}?reviewerType=all_reviews&pageNumber=${page}`, "[data-hook='review'], [data-hook='review-body'], h1");
    if (!doc) {
      break;
    }

    if (/sign in|giriş yapın|captcha/i.test(doc.title) || /Giriş yapın veya hesap oluşturun/i.test(doc.body?.innerText ?? "")) {
      break;
    }

    const pageDetails = extractReviewDetailsFromDom(doc);
    if (pageDetails.length === 0) {
      break;
    }

    for (const detail of pageDetails) {
      const key = normalizeReviewKey(detail.text);
      if (!seen.has(key)) {
        seen.add(key);
        allDetails.push(detail);
      }
      if (allDetails.length >= targetCount) {
        break;
      }
    }
  }

  return allDetails;
}

async function collectAllReviewsLayered(
  asin: string | null,
  targetCount = TARGET_REVIEW_COUNT
): Promise<{
  reviewDetails: ScrapedReviewDetail[];
  source: ScrapeSource;
}> {
  const seenTexts = new Set<string>();
  const allDetails: ScrapedReviewDetail[] = [];

  function addReviews(details: ScrapedReviewDetail[]) {
    for (const d of details) {
      const norm = normalizeReviewKey(d.text);
      if (norm && norm.length > 15 && !seenTexts.has(norm)) {
        seenTexts.add(norm);
        allDetails.push(d);
      }
    }
  }

  // 1. Structured review details
  const structured = getStructuredReviewDetails();
  addReviews(structured);
  if (allDetails.length >= targetCount) {
    return { reviewDetails: allDetails, source: "structured_data" };
  }

  // 2. Product page DOM
  const domReviews = extractReviewDetailsFromDom(document);
  addReviews(domReviews);
  if (allDetails.length >= targetCount) {
    return { reviewDetails: allDetails, source: "dom" };
  }

  // 3. Fetched same-origin product page
  if (asin) {
    const fetchedProductPage = await fetchProductPageReviewDetails(asin);
    addReviews(fetchedProductPage);
    if (allDetails.length >= targetCount) {
      return { reviewDetails: allDetails, source: "amazon_review_page" };
    }
  }

  // 4. Review pages
  if (asin) {
    const fetchedReviewPages = await fetchReviewPageDetails(asin, targetCount);
    addReviews(fetchedReviewPages);
    if (allDetails.length >= targetCount) {
      return { reviewDetails: allDetails, source: "amazon_review_page" };
    }
  }

  // 5. Scroll fallback
  if (allDetails.length < LOW_REVIEW_COUNT_THRESHOLD) {
    await scrollToLoadAmazonReviews();
    const scrolledDom = extractReviewDetailsFromDom(document);
    addReviews(scrolledDom);
  }

  let finalSource: ScrapeSource = "dom";
  if (structured.length > 0 && allDetails.every(r => structured.some(s => s.text === r.text))) {
    finalSource = "structured_data";
  } else if (allDetails.length > 0) {
    finalSource = "amazon_review_page";
  } else {
    finalSource = "fallback";
  }

  return {
    reviewDetails: allDetails,
    source: finalSource
  };
}

function buildAmazonPriceHistory(
  selectedListingId: string | null,
  asin: string | null,
  price: PriceExtraction,
  candidatesCount: number
): ExternalPriceHistory | undefined {
  if (!price.value || price.value <= 0) {
    return undefined;
  }

  let selectedReason = "amazon_buybox_live_price_snapshot";
  if (price.selector.includes("aod")) {
    selectedReason = "amazon_aod_live_offer_snapshot";
  } else if (price.selector.includes("structured")) {
    selectedReason = "amazon_structured_data_price_snapshot";
  }

  const date = new Date().toISOString().slice(0, 10);
  return {
    source: "amazon_live_offer",
    listingId: selectedListingId ?? asin ?? undefined,
    contentId: asin ?? undefined,
    candidatesChecked: candidatesCount,
    selectedReason,
    prices: {
      [date]: price.value
    }
  };
}

function extractSellerMetadata(
  seller: string,
  offerPayload: OfferListingPayload | null,
  identities: ReturnType<typeof extractAmazonIdentities>
): SellerMetadata {
  const bodyText = document.body.innerText || "";
  
  let sellerName = seller && seller !== "N/A" ? seller : undefined;
  if (!sellerName && offerPayload?.seller) {
    sellerName = offerPayload.seller;
  }
  
  const brandStoreLink = document.querySelector<HTMLAnchorElement>("#bylineInfo[href], a[href*='/stores/']");
  const sellerStoreLink = document.querySelector<HTMLAnchorElement>("#sellerProfileTriggerId[href], #merchant-info a[href]");
  
  let storeUrl = offerPayload?.sellerMetadata.store_url || sellerStoreLink?.href || brandStoreLink?.href;
  if (storeUrl && storeUrl.startsWith("/")) {
    storeUrl = `${amazonOrigin()}${storeUrl}`;
  }

  const badges = Array.from(new Set([
    ...(offerPayload?.sellerMetadata.seller_badges ?? []),
    /Amazon tarafından gönderilir|Gönderimi Sağlayan\s*(?::)?\s*Amazon|Ships from Amazon|Fulfilled by Amazon/i.test(bodyText) ? "Amazon fulfilled" : "",
    /Amazon.com.tr tarafından satılır|Ships from and sold by Amazon|sold by Amazon|Amazon.com.tr satıcı/i.test(bodyText) ? "Amazon seller" : "",
    /ÜCRETSİZ teslimat|free delivery|free shipping|ücretsiz kargo/i.test(bodyText) ? "Free delivery" : "",
    sellerName === "Amazon" || sellerName === "Amazon.com.tr" ? "Official Seller" : ""
  ].filter(Boolean)));

  const isAmazonFulfilled = badges.includes("Amazon fulfilled");
  const isAmazonSeller = badges.includes("Amazon seller") || sellerName === "Amazon" || sellerName === "Amazon.com.tr";
  const verifiedBadgeAvailable = isAmazonFulfilled || isAmazonSeller || !!offerPayload?.sellerMetadata.verified_badge_available;

  return {
    seller_name: sellerName,
    marketplace_seller_score: offerPayload?.sellerMetadata.marketplace_seller_score,
    seller_follower_count: offerPayload?.sellerMetadata.seller_follower_count,
    seller_badges: badges,
    verified_badge_available: verifiedBadgeAvailable,
    fast_delivery_available: !!(offerPayload?.sellerMetadata.fast_delivery_available || /yarın|tomorrow|hızlı|fast/i.test(bodyText)),
    free_shipping_available: !!(offerPayload?.sellerMetadata.free_shipping_available || /ÜCRETSİZ teslimat|free delivery|free shipping/i.test(bodyText)),
    store_url: storeUrl
  };
}

function buildMetadata(
  product: Omit<ScrapedProduct, "metadata">,
  productId: string | null,
  selectedListingId: string | null,
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
    listingId: selectedListingId ?? undefined,
    source,
    diagnostics,
    confidence,
    reviewCount: getReviewCountFromPage(product.reviews.length),
    missingFields,
    warnings
  };
}

export class AmazonScraper implements Scraper {
  canHandle(url: string): boolean {
    return /amazon\.(com|com\.tr|co\.uk|de|fr|it|es)/i.test(url);
  }

  async scrape(): Promise<ScrapedProduct> {
    console.log("[BiBak] Starting Amazon scrape...");

    await waitForElement("body", 5000);
    await waitForElement(SELECTORS.title[0], 5000);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const identities = extractAmazonIdentities();
    const productId = identities.asin;
    const selectedListingId = identities.selectedListingId;

    const offerPayload = await fetchOfferListingPayload(productId);
    const title = extractTitle();
    
    const { price: pagePrice, candidatesChecked } = extractPrice();
    const price = pagePrice.text ? pagePrice : offerPayload?.price.text ? offerPayload.price : pagePrice;
    
    const priceHistory = buildAmazonPriceHistory(selectedListingId, productId, price, candidatesChecked);
    
    const seller = extractSeller() || offerPayload?.seller || "";
    const sellerMetadata = extractSellerMetadata(seller, offerPayload, identities);
    
    const { reviewDetails, source } = await collectAllReviewsLayered(productId);
    const reviews = reviewDetails.map((review) => review.text);
    const rating = extractRatingFromDom();

    const product = {
      title,
      price: price.text || "N/A",
      seller: seller || "N/A",
      reviews,
      reviewDetails: reviewDetails.length > 0
        ? reviewDetails
        : reviews.map((review) => ({ text: review, rating: rating || undefined })),
      rating,
      platform: "amazon",
      sellerMetadata
    } satisfies Omit<ScrapedProduct, "metadata">;

    const scraped: ScrapedProduct = {
      ...product,
      metadata: buildMetadata(product, productId, selectedListingId, source, {
        priceText: price.text || undefined,
        parsedPrice: price.value,
        priceSelector: price.selector || undefined,
        contentId: productId,
        selectedListingId: selectedListingId,
        historySource: priceHistory?.source,
        historyCount: priceHistory ? Object.keys(priceHistory.prices).length : 0,
        historyCandidatesChecked: candidatesChecked,
        historySelectionReason: priceHistory?.selectedReason
      }),
      priceHistory
    };

    console.log("[BiBak] Scraped Amazon data:", {
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
      throw new Error("Amazon product data could not be extracted");
    }

    return scraped;
  }
}
