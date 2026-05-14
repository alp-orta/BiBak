# BiBak

BiBak is a browser extension plus local Flask API for product trust analysis.

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
