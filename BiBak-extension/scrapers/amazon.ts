import { ScrapedProduct, Scraper } from "./index";
import { queryAll, extractText, extractNumber, waitForElement } from "./utils";

const SELECTORS = {
  title: ["#productTitle", "h1"],
  price: [".a-price .a-offscreen", "#priceblock_ourprice", ".a-price-whole"],
  seller: ["#sellerProfileTriggerId", "#merchant-info", ".tabular-buybox-text[tabular-attribute-name=\"Sold by\"]"],
  rating: ["#acrPopover span.a-size-base", ".a-icon-star"],
  reviews: ["div.review-text-content span", ".review-text"]
};

export class AmazonScraper implements Scraper {
  canHandle(url: string): boolean {
    return url.includes("amazon.com") || url.includes("amazon.com.tr");
  }

  async scrape(): Promise<ScrapedProduct> {
    console.log("[BiBak] Starting Amazon scrape...");
    
    await waitForElement(SELECTORS.title[0], 5000);
    
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

    console.log("[BiBak] Scraped Amazon data:", { title, price, seller, rating, reviewsCount: reviews.length });

    return {
      title,
      price,
      seller,
      reviews,
      rating,
      platform: "amazon"
    };
  }
}
