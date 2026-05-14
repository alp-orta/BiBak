export interface ScrapedProduct {
  title: string;
  price: string;
  seller: string;
  reviews: string[];
  rating: number;
  platform: "trendyol" | "hepsiburada" | "amazon" | "unknown";
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
      platform: "unknown"
    };
  }

  try {
    return await scraper.scrape();
  } catch (error) {
    console.error("[BiBak] Scraping failed:", error);
    throw error;
  }
}
