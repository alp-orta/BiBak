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

## Development Principles
1. **MVP First**: Prioritize demo polish and working architecture over complex model training initially.
2. **Premium Aesthetics**: The UI must look like a high-end consumer product (glassmorphism, smooth transitions).
3. **Demo Realism**: Use realistic synthetic data for demo scenarios (Amazon, Trendyol, Hepsiburada).
4. **i18n**: Support Turkish and English, auto-detecting from browser locale.

## Folder Structure
- `/BiBak-extension`: Plasmo project.
- `/BiBak-api`: Flask backend.
- `/shared`: Shared mock datasets and schemas.

## Current State (Phase 1 Complete)
- Infrastructure is fully scaffolded.
- Frontend UI is premium and animated.
- Backend is connected and returning locale-aware mock analysis.
- Git repository: `https://github.com/alp-orta/BiBak.git`
