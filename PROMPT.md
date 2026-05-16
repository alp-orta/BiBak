# BiBak Project Definition & AI Context

This document serves as the master reference for BiBak's vision and technical requirements. Use this to provide context to any AI assistant joining the project.

## Project Vision
BiBak is an AI-powered Chrome browser extension that analyzes e-commerce product pages in real-time to detect:
- **Fake discounts** (artificial price spikes followed by "discounts").
- **Suspicious review manipulation** (bot-generated or clustered sentiment).
- **Abnormal seller trust patterns**.
- **Risky purchase timing**.

It produces a **Trust Score (0–100)**, explains the reasoning, and recommends safer alternatives.

## Technical Architecture (MVP)

### Frontend Extension
- **Framework**: [Plasmo](https://www.plasmo.com/) (Chrome MV3)
- **UI Logic**: React + Framer Motion (for premium animations)
- **Styling**: Inline Styles (for Shadow DOM compatibility) + Lucide Icons
- **Key Files**:
    - `sidebar.tsx`: Content script for injection and data extraction.
    - `TrustSidebar.tsx`: The main UI component (glassmorphic dark design).
    - `translations.ts`: i18n support (TR/EN).

### Backend API
- **Framework**: Python Flask (selected for maximum compatibility with Python 3.14+)
- **Analysis Port**: `8000`
- **Key Endpoint**: `POST /analyze-product`
- **Logic Layer**: `ml_engine.py` (Handles scoring, risk flags, and explanations).

### AI / ML (Planned)
- `sentence-transformers`: For review semantic similarity/clustering.
- `scikit-learn`: For anomaly detection (Isolation Forest).
- `xgboost`: For final Trust Score prediction.

### Current AI / ML Reality
- Review analysis currently uses `sentence-transformers` embeddings, DBSCAN clustering, lexical/statistical features, and anomaly scoring.
- Final Trust Score is still heuristic weighted scoring in `ml_engine.py`; `xgboost` is installed but no trained final scoring model, labeled dataset, calibration pipeline, or evaluation benchmark exists yet.
- Price history, seller history, and safer alternatives currently depend on local SQLite snapshots plus any scraper-provided external price history.

## Development Principles
1. **MVP First**: Prioritize demo polish and working architecture over complex model training initially.
2. **Premium Aesthetics**: The UI must look like a high-end consumer product (glassmorphism, smooth transitions).
3. **Demo Realism**: Use realistic synthetic data for demo scenarios (Amazon, Trendyol, Hepsiburada).
4. **i18n**: Support Turkish and English, auto-detecting from browser locale.

## Folder Structure
- `/BiBak-extension`: Plasmo project.
- `/BiBak-api`: Flask backend.
- `/shared`: Shared mock datasets and schemas.

## Current State (Working Local MVP)
- Browser extension injects a collapsible sidebar on supported e-commerce product pages.
- Trendyol scraping is the strongest current path, including price parsing diagnostics and internal price history support.
- Amazon and Hepsiburada support exist but need substantially better scraper reliability and data coverage.
- Flask backend exposes `POST /analyze-product`, validates the API contract, and returns locale-aware trust analysis.
- Backend produces review authenticity, price integrity, seller reliability, purchase timing, safer alternatives, warnings, and explanations.
- Local SQLite records product and seller snapshots for price history, seller history, and alternative-product suggestions.
- Extension has a local fallback analysis path when the backend is unavailable.
- Backend unit tests and extension TypeScript checks are part of the current verification flow.

## Known Product Gaps
- Production/shared data backend is missing; local SQLite cannot provide strong first-visit price history, seller reputation, or alternatives.
- Trust scoring is not trained or calibrated against labeled outcomes.
- Safer alternatives are limited to locally observed products and simple title-token similarity.
- Review-analysis evidence is not deeply exposed in the UI; suspicious clusters and per-review flags are mostly backend-only.
- User feedback, correction, reporting, privacy controls, deployment/onboarding, and operational monitoring are not yet productized.
