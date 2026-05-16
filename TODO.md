# BiBak TODOs

## Price and Trust Signal Follow-ups

- [x] Add reusable Trendyol price parsing fixtures for coupons, unit prices, crossed prices, campaign boxes, normal prices, and missing prices.
- [x] Add scraper diagnostics for development: scraped price text, parsed price, matched selector, selected listing ID, content ID, history source, and history count.
- [x] Improve Trendyol listing/history matching so the chosen price history is ranked against the active seller/current listing instead of using the first non-empty history.
- [x] Show a clear UI warning when live price and Trendyol history disagree, especially when history may belong to a different listing or seller.
- [x] Tighten safer alternatives so they only appear for genuinely comparable products with strong title/category similarity and sane price data.
