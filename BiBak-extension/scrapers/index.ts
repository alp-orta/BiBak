export interface ScrapedProduct {
  title: string;
  price: string;
  seller: string;
  reviews: string[];
  rating: number;
  platform: "trendyol" | "hepsiburada" | "amazon" | "unknown";
  metadata?: ScrapeMetadata;
  priceHistory?: ExternalPriceHistory;
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

export async function scrapeCurrentPage(): Promise<ScrapedProduct> {
  const url = window.location.href;
  const scraper = SCRAPERS.find(s => s.canHandle(url));

  if (!scraper) {
    console.warn("[BiBak] No scraper found for this URL:", url);
    return {
      title: document.title || "Unknown Product",
      price: "N/A",
      seller: "N/A",
      reviews: [],
      rating: 0,
      platform: "unknown",
      metadata: {
        source: "fallback",
        confidence: 20,
        reviewCount: 0,
        missingFields: ["price", "seller", "rating", "reviews"],
        warnings: ["missing_price", "missing_seller", "missing_rating", "no_reviews"]
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
