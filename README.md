# BiBak

BiBak is a browser extension plus local Flask API for product trust analysis.

## Shared History MVP

The API records metadata-only shared product, seller, and price observations in SQLite through `/history/observe` and `/analyze-product`. It stores product/listing/seller identifiers, price, currency, scrape source, scrape confidence, and warning codes. It does not store user identity or full review text for shared history.

This is an MVP data path for shared price and seller history, not a recommendation system. Current limitations include no deduplication, retention policy, moderation tooling, or production shared database.

## Local Development

API:

```bash
cd BiBak-api
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python main.py
```

Extension:

```bash
cd BiBak-extension
npm install
npm run dev
```

Optional extension config:

```bash
cp .env.example .env
```

## Verification

```bash
cd BiBak-api
./venv/bin/python -m unittest discover -s tests
./venv/bin/python test_integration.py

cd ../BiBak-extension
npm run typecheck
npm run build
```
