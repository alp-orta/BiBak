export interface ScrapedProduct {
  title: string;
  price: string;
  seller: string;
  reviews: string[];
  reviewDetails?: ScrapedReviewDetail[];
  rating: number;
  platform: "trendyol" | "hepsiburada" | "amazon" | "unknown";
  sellerMetadata?: SellerMetadata;
  metadata?: ScrapeMetadata;
  priceHistory?: ExternalPriceHistory;
}

export interface SellerMetadata {
  marketplace_seller_score?: number;
  seller_age_days?: number;
  seller_follower_count?: number;
  seller_badges?: string[];
  verified_badge_available?: boolean;
  fast_delivery_available?: boolean;
  free_shipping_available?: boolean;
  store_url?: string;
  seller_name?: string;
}

export interface ScrapedReviewDetail {
  id?: string | number;
  text: string;
  rating?: number;
  created_at?: string;
}

export interface ExternalPriceHistory {
  source: "trendyol_internal";
  listingId?: string;
  contentId?: string;
  candidatesChecked?: number;
  selectedReason?: string;
  prices: Record<string, number>;
}

export type ScrapeSource =
  | "dom"
  | "structured_data"
  | "trendyol_detailed_api"
  | "trendyol_review_api"
  | "trendyol_review_page"
  | "fallback";

export type MissingProductField = "title" | "price" | "seller" | "rating" | "reviews";

export type ScrapeWarning =
  | "not_product_page"
  | "missing_title"
  | "missing_price"
  | "missing_seller"
  | "missing_rating"
  | "low_review_count"
  | "no_reviews";

export interface ScrapeMetadata {
  productId?: string;
  listingId?: string;
  diagnostics?: {
    priceText?: string;
    parsedPrice?: number | null;
    priceSelector?: string;
    selectedListingId?: string | null;
    contentId?: string | null;
    historySource?: string;
    historyCount?: number;
    historyCandidatesChecked?: number;
    historySelectionReason?: string;
  };
  source: ScrapeSource;
  confidence: number;
  reviewCount: number;
  missingFields: MissingProductField[];
  warnings: ScrapeWarning[];
}

export interface Scraper {
  canHandle(url: string): boolean;
  scrape(): Promise<ScrapedProduct>;
}

import { TrendyolScraper } from "./trendyol";
import { HepsiburadaScraper } from "./hepsiburada";
import { AmazonScraper } from "./amazon";

const SCRAPERS: Scraper[] = [
  new TrendyolScraper(),
  new HepsiburadaScraper(),
  new AmazonScraper()
];

function isSupportedProductPage(url: string): boolean {
  if (url.includes("trendyol.com")) {
    return /-p-\d+/i.test(url);
  }

  if (url.includes("amazon.com") || url.includes("amazon.com.tr")) {
    return /\/(?:dp|gp\/product)\//i.test(url);
  }

  if (url.includes("hepsiburada.com")) {
    return /-p-[A-Za-z0-9]+/i.test(url) || /\/[A-Za-z0-9-]+-p-[A-Za-z0-9]+/i.test(url);
  }

  return false;
}

export async function scrapeCurrentPage(): Promise<ScrapedProduct> {
  const url = window.location.href;
  const scraper = SCRAPERS.find(s => s.canHandle(url));

  if (!scraper || !isSupportedProductPage(url)) {
    console.warn("[BiBak] No product page found for this URL:", url);
    return {
      title: "",
      price: "N/A",
      seller: "N/A",
      reviews: [],
      rating: 0,
      platform: "unknown",
      metadata: {
        source: "fallback",
        confidence: 0,
        reviewCount: 0,
        missingFields: ["title", "price", "seller", "rating", "reviews"],
        warnings: ["not_product_page", "missing_title", "missing_price", "missing_seller", "missing_rating", "no_reviews"]
      }
    };
  }

  try {
    return await scraper.scrape();
  } catch (error) {
    console.error("[BiBak] Scraping failed:", error);
    throw error;
  }
}
