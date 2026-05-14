import { ScrapedProduct, Scraper } from "./index";
import { queryAll, extractText, extractNumber, waitForElement } from "./utils";

const SELECTORS = {
  title: ["h1.product-name", "#product-name", "h1"],
  price: [".product-price", "span[data-bind=\"markupText\"]", "#offering-price"],
  seller: [".merchant-box-wrapper .merchant-name", ".seller-name"],
  rating: [".ratings .rating-score", ".rating-star"],
  reviews: [".hermes-ReviewCard-module-comment p", ".review-text"]
};

export class HepsiburadaScraper implements Scraper {
  canHandle(url: string): boolean {
    return url.includes("hepsiburada.com");
  }

  async scrape(): Promise<ScrapedProduct> {
    console.log("[BiBak] Starting Hepsiburada scrape...");
    
    await waitForElement("h1", 5000);
    
    // Smoothly scroll a bit down
    window.scrollBy({ top: 500, behavior: "smooth" });
    await new Promise(r => setTimeout(r, 1000));

    const titleEl = queryAll(SELECTORS.title);
    const priceEl = queryAll(SELECTORS.price);
    const sellerEl = queryAll(SELECTORS.seller);
    const ratingEl = queryAll(SELECTORS.rating);
    
    const title = extractText(titleEl);
    const price = extractText(priceEl);
    const seller = extractText(sellerEl);
    const ratingText = extractText(ratingEl);
    const rating = ratingText ? extractNumber(ratingText) : 0;

    const reviewEls = document.querySelectorAll(SELECTORS.reviews.join(", "));
    const reviews: string[] = [];
    reviewEls.forEach(el => {
      const text = extractText(el);
      if (text && text.length > 5) {
        reviews.push(text);
      }
    });

    console.log("[BiBak] Scraped Hepsiburada data:", { title, price, seller, rating, reviewsCount: reviews.length });

    return {
      title,
      price,
      seller,
      reviews,
      rating,
      platform: "hepsiburada"
    };
  }
}
