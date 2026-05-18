# BiBak TODOs

## Price and Trust Signal Follow-ups

- [x] Add reusable Trendyol price parsing fixtures for coupons, unit prices, crossed prices, campaign boxes, normal prices, and missing prices.
- [x] Add scraper diagnostics for development: scraped price text, parsed price, matched selector, selected listing ID, content ID, history source, and history count.
- [x] Improve Trendyol listing/history matching so the chosen price history is ranked against the active seller/current listing instead of using the first non-empty history.
- [x] Show a clear UI warning when live price and Trendyol history disagree, especially when history may belong to a different listing or seller.

## P0: Data Backend and History Coverage

- [ ] Design a shared product/seller/price history backend so analysis does not depend only on the local user's SQLite snapshots.
- [ ] Add ingestion jobs or APIs for normalized product snapshots, seller snapshots, price observations, and review samples.
- [ ] Define product identity rules per platform, including canonical URL, product ID, listing ID, seller ID, variant ID, and category.
- [ ] Add data freshness, deduplication, and retention policies for price and seller history.
- [ ] Add a migration path from local SQLite history to the shared backend or a hybrid local-plus-remote model.

## P0: Trust Score Calibration

- [ ] Build a labeled evaluation dataset for trustworthy, suspicious, fake-discount, review-manipulated, and low-evidence products.
- [ ] Define target labels and acceptance metrics for review authenticity, price integrity, seller reliability, and overall trust.
- [ ] Replace or augment the heuristic final Trust Score with a trained/calibrated model.
- [ ] Add offline evaluation reports for precision, recall, calibration, and false-positive cases.
- [ ] Add regression tests that lock expected score bands for representative clean, mixed, suspicious, and low-data products.

## P1: Review Evidence UI

- [ ] Show suspicious review clusters with sample texts and similarity reasons.
- [ ] Add a review-quality breakdown for packaging-only, pre-use, detailed-use, benefit, and negative-result reviews.
- [ ] Expose per-review risk flags in a compact drilldown without overwhelming the main trust score view.
- [ ] Add clear low-evidence states when review count, review age, or scrape confidence is insufficient.
- [ ] Add i18n strings for all new evidence explanations in Turkish and English.

## P1: User Feedback and Corrections

- [ ] Add feedback actions for useful analysis, wrong analysis, wrong price, wrong seller, and wrong reviews.
- [ ] Store feedback with enough context to reproduce the analysis result.
- [ ] Add a lightweight admin/export path for reviewing feedback and creating labeled examples.
- [ ] Add user-visible retry or refresh controls for stale or failed analysis.

## P1: Deployment and Onboarding

- [ ] Decide whether the default product will use a hosted API, local-only API, or hybrid mode.
- [ ] Add API health checks and a first-run setup state in the extension.
- [ ] Add installation/onboarding copy for starting or configuring the backend.
- [ ] Add production API configuration, environment validation, and release build documentation.
- [ ] Prepare Chrome extension packaging and store-readiness checklist.

## P1: Privacy, Permissions, and Controls

- [ ] Narrow extension host permissions where possible instead of broad `https://*/*` access.
- [ ] Add a settings view for API endpoint, locale, data sharing, local history, and privacy controls.
- [ ] Document what product page data is collected, where it is sent, and how long it is retained.
- [ ] Add controls to clear local history and disable remote analysis if a hosted backend is introduced.
- [ ] Review privacy implications of review text collection and seller/product snapshot storage.

## P2: Observability and Reliability

- [ ] Add structured backend logs for scrape confidence, analysis latency, model fallback, and warning codes.
- [ ] Track extension-side backend availability, fallback usage, and scrape failure categories.
- [ ] Add latency budgets for scraping, embedding generation, backend analysis, and sidebar rendering.
- [ ] Add monitoring or diagnostics export for local development and production debugging.
- [ ] Add CI commands for backend tests, extension typecheck, and extension build.

## P2: Documentation

- [ ] Keep `PROMPT.md` aligned with the actual architecture and current state after major milestones.
- [ ] Add an architecture diagram covering extension, scraper, background worker, API, ML pipeline, and data store.
- [ ] Document the analysis contract and warning codes shared between extension and backend.
- [ ] Document known scraper limitations by platform, including Amazon and Hepsiburada.
