import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.product_identity import resolve_product_identity


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "bibak.sqlite3"


def get_db_path() -> Path:
    configured = os.environ.get("BIBAK_DB_PATH")
    return Path(configured) if configured else DEFAULT_DB_PATH


@contextmanager
def connect():
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        _ensure_schema(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS product_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            product_key TEXT NOT NULL,
            platform TEXT NOT NULL,
            product_id TEXT,
            url TEXT,
            title TEXT,
            seller TEXT,
            price_text TEXT,
            price_value REAL,
            currency TEXT,
            rating REAL,
            review_count INTEGER,
            fraud_score INTEGER,
            trust_score INTEGER,
            scrape_confidence INTEGER,
            missing_fields TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS seller_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            platform TEXT NOT NULL,
            seller TEXT NOT NULL,
            product_key TEXT NOT NULL,
            rating REAL,
            review_count INTEGER,
            fraud_score INTEGER,
            trust_score INTEGER,
            scrape_confidence INTEGER,
            missing_fields TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS price_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            platform TEXT NOT NULL,
            product_key TEXT NOT NULL,
            product_id TEXT,
            listing_id TEXT,
            seller TEXT,
            price REAL NOT NULL,
            currency TEXT,
            source TEXT NOT NULL,
            scrape_confidence INTEGER,
            warning_codes TEXT NOT NULL DEFAULT '[]'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS product_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            platform TEXT NOT NULL,
            product_key TEXT NOT NULL,
            product_id TEXT,
            listing_id TEXT,
            url TEXT,
            title TEXT,
            seller TEXT,
            source TEXT NOT NULL,
            scrape_confidence INTEGER,
            warning_codes TEXT NOT NULL DEFAULT '[]'
        )
        """
    )
    _add_column(conn, "seller_snapshots", "observed_at", "TEXT")
    _add_column(conn, "seller_snapshots", "seller_id", "TEXT")
    _add_column(conn, "seller_snapshots", "listing_id", "TEXT")
    _add_column(conn, "seller_snapshots", "marketplace_score", "REAL")
    _add_column(conn, "seller_snapshots", "follower_count", "INTEGER")
    _add_column(conn, "seller_snapshots", "badges", "TEXT")
    _add_column(conn, "seller_snapshots", "source", "TEXT")
    _add_column(conn, "seller_snapshots", "warning_codes", "TEXT")
    _add_column(conn, "seller_snapshots", "variant_id", "TEXT")
    _add_column(conn, "seller_snapshots", "category", "TEXT")
    _add_column(conn, "product_snapshots", "listing_id", "TEXT")
    _add_column(conn, "product_snapshots", "seller_id", "TEXT")
    _add_column(conn, "product_snapshots", "variant_id", "TEXT")
    _add_column(conn, "product_snapshots", "category", "TEXT")
    _add_column(conn, "product_observations", "seller_id", "TEXT")
    _add_column(conn, "product_observations", "variant_id", "TEXT")
    _add_column(conn, "product_observations", "category", "TEXT")
    _add_column(conn, "price_observations", "seller_id", "TEXT")
    _add_column(conn, "price_observations", "variant_id", "TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_key ON product_snapshots(product_key, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seller ON seller_snapshots(platform, seller, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_platform ON product_snapshots(platform, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_price_observations_product ON price_observations(platform, product_key, observed_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_price_observations_listing ON price_observations(platform, listing_id, observed_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_observations_product ON product_observations(platform, product_key, observed_at)")


def _add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def make_product_key(product: dict[str, Any]) -> str:
    return resolve_product_identity(product).product_key


def _product_key_aliases(product_key: str | None) -> list[str]:
    if not product_key:
        return []
    aliases = [product_key]
    parts = product_key.split(":")
    if len(parts) == 3 and parts[1] == "product":
        aliases.append(f"{parts[0]}:{parts[2]}")
    return list(dict.fromkeys(aliases))


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _coerce_platform(value: Any) -> str:
    platform = _coerce_text(value).lower()
    return platform if platform in ("trendyol", "hepsiburada", "amazon", "unknown") else "unknown"


def _coerce_confidence(value: Any) -> int | None:
    try:
        confidence = int(value)
    except (TypeError, ValueError):
        return None
    return max(0, min(100, confidence))


def _coerce_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _coerce_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _warning_codes(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item)[:80] for item in value if isinstance(item, str) and item.strip()]


def _metadata_from_product(product: dict[str, Any]) -> tuple[str | None, int | None, list[str]]:
    metadata = product.get("scrape_metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}
    source = _coerce_text(metadata.get("source")) or None
    warnings = _warning_codes(metadata.get("warnings"))
    missing = metadata.get("missingFields") or metadata.get("missing_fields") or []
    warnings.extend(f"missing_{field}" for field in missing if isinstance(field, str))
    return source, _coerce_confidence(metadata.get("confidence")), list(dict.fromkeys(warnings))


def _listing_id_from_product(product: dict[str, Any]) -> str:
    return resolve_product_identity(product).listing_id or ""


def _seller_id_from_product(product: dict[str, Any]) -> str:
    return resolve_product_identity(product).seller_id or ""


def _normalize_observation_payload(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    platform = _coerce_platform(payload.get("platform"))
    identity = resolve_product_identity(payload)
    product_id = identity.product_id or ""
    listing_id = identity.listing_id or ""
    seller_id = identity.seller_id or ""
    variant_id = identity.variant_id or ""
    seller = _coerce_text(payload.get("seller") or payload.get("seller_name"))
    title = _coerce_text(payload.get("title"))
    url = identity.canonical_url or _coerce_text(payload.get("url"))
    category = identity.category or None
    product_key = identity.product_key

    source = _coerce_text(payload.get("source")) or "history_observe"
    confidence = _coerce_confidence(payload.get("scrape_confidence"))
    warnings = _warning_codes(payload.get("warning_codes") or payload.get("warnings"))
    observed_at = _coerce_text(payload.get("observed_at")) or _now_iso()

    if platform == "unknown":
        errors.append("platform is required")
    if not (product_id or title or url):
        errors.append("one product identifier is required")

    product_observation = {
        "observed_at": observed_at,
        "platform": platform,
        "product_key": product_key,
        "product_id": product_id or None,
        "listing_id": listing_id or None,
        "seller_id": seller_id or None,
        "variant_id": variant_id or None,
        "url": url or None,
        "title": title or None,
        "seller": seller or None,
        "category": category,
        "source": source,
        "scrape_confidence": confidence,
        "warning_codes": warnings,
    }

    price_payload = payload.get("price")
    price = _coerce_float(price_payload.get("value")) if isinstance(price_payload, dict) else _coerce_float(price_payload)
    currency = _coerce_text((price_payload or {}).get("currency") if isinstance(price_payload, dict) else payload.get("currency")).upper()
    price_observation = None
    if price is not None:
        price_observation = {
            **{key: product_observation[key] for key in ("observed_at", "platform", "product_key", "product_id", "listing_id", "seller_id", "variant_id", "seller", "source", "scrape_confidence", "warning_codes")},
            "price": price,
            "currency": currency or None,
        }
    elif "price" in payload:
        errors.append("price must be a positive number or {value,currency}")

    seller_payload = payload.get("seller_snapshot") if isinstance(payload.get("seller_snapshot"), dict) else {}
    seller_name = _coerce_text(seller_payload.get("seller") or seller_payload.get("seller_name") or seller)
    seller_snapshot = None
    if seller_name:
        seller_snapshot = {
            "observed_at": observed_at,
            "platform": platform,
            "seller": seller_name,
            "seller_id": _coerce_text(seller_payload.get("seller_id") or payload.get("seller_id") or seller_id) or None,
            "product_key": product_key,
            "listing_id": listing_id or None,
            "variant_id": variant_id or None,
            "category": category,
            "rating": _coerce_float(seller_payload.get("rating") or payload.get("rating")),
            "marketplace_score": _coerce_float(seller_payload.get("marketplace_score") or seller_payload.get("marketplace_seller_score")),
            "follower_count": _coerce_int(seller_payload.get("follower_count") or seller_payload.get("seller_follower_count")),
            "badges": _warning_codes(seller_payload.get("badges") or seller_payload.get("seller_badges")),
            "scrape_confidence": confidence,
            "source": source,
            "warning_codes": warnings,
        }

    return product_observation, price_observation, seller_snapshot, errors


def normalize_observation_payload(payload: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    if not isinstance(payload, dict):
        return {}, ["payload must be an object"]
    product_observation, price_observation, seller_snapshot, errors = _normalize_observation_payload(payload)
    return {
        "product_observation": product_observation,
        "price_observation": price_observation,
        "seller_snapshot": seller_snapshot,
    }, errors


def get_product_snapshots(product_key: str) -> list[dict[str, Any]]:
    product_keys = _product_key_aliases(product_key)
    placeholders = ",".join("?" for _ in product_keys)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM product_snapshots
            WHERE product_key IN ({placeholders})
            ORDER BY created_at ASC, id ASC
            """,
            product_keys,
        ).fetchall()
    return [dict(row) for row in rows]


def get_price_observations(
    platform: str,
    product_key: str | None = None,
    listing_id: str | None = None,
    limit: int = 60,
) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit or 60), 120))
    clauses = ["platform = ?"]
    params: list[Any] = [platform or "unknown"]
    if listing_id:
        clauses.append("listing_id = ?")
        params.append(listing_id)
    elif product_key:
        product_keys = _product_key_aliases(product_key)
        placeholders = ",".join("?" for _ in product_keys)
        clauses.append(f"product_key IN ({placeholders})")
        params.extend(product_keys)
    else:
        return []

    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                id,
                observed_at AS created_at,
                observed_at,
                platform,
                product_key,
                product_id,
                listing_id,
                seller,
                price AS price_value,
                price,
                currency,
                source,
                scrape_confidence,
                warning_codes,
                'shared_history' AS history_source
            FROM price_observations
            WHERE {' AND '.join(clauses)}
            ORDER BY observed_at ASC, id ASC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def get_seller_snapshots(platform: str, seller: str) -> list[dict[str, Any]]:
    if not seller or seller == "N/A":
        return []

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM seller_snapshots
            WHERE platform = ? AND lower(seller) = lower(?)
            ORDER BY created_at ASC, id ASC
            """,
            (platform or "unknown", seller),
        ).fetchall()
    return [dict(row) for row in rows]


def get_shared_seller_snapshots(platform: str, seller: str, limit: int = 60) -> list[dict[str, Any]]:
    if not seller or seller == "N/A":
        return []

    limit = max(1, min(int(limit or 60), 120))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM seller_snapshots
            WHERE platform = ?
              AND lower(seller) = lower(?)
              AND source IS NOT NULL
            ORDER BY COALESCE(observed_at, created_at) ASC, id ASC
            LIMIT ?
            """,
            (platform or "unknown", seller, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def record_observation(payload: dict[str, Any]) -> dict[str, Any]:
    normalized, errors = normalize_observation_payload(payload)
    if errors:
        raise ValueError(", ".join(errors))

    product_observation = normalized["product_observation"]
    price_observation = normalized["price_observation"]
    seller_snapshot = normalized["seller_snapshot"]
    inserted = {"product_observation": False, "price_observation": False, "seller_snapshot": False}

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO product_observations (
                observed_at, platform, product_key, product_id, listing_id, url, title,
                seller, seller_id, variant_id, category, source, scrape_confidence, warning_codes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product_observation["observed_at"],
                product_observation["platform"],
                product_observation["product_key"],
                product_observation["product_id"],
                product_observation["listing_id"],
                product_observation["url"],
                product_observation["title"],
                product_observation["seller"],
                product_observation["seller_id"],
                product_observation["variant_id"],
                product_observation["category"],
                product_observation["source"],
                product_observation["scrape_confidence"],
                json.dumps(product_observation["warning_codes"]),
            ),
        )
        inserted["product_observation"] = True

        if price_observation:
            conn.execute(
                """
                INSERT INTO price_observations (
                    observed_at, platform, product_key, product_id, listing_id, seller_id,
                    variant_id, seller, price, currency, source, scrape_confidence, warning_codes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    price_observation["observed_at"],
                    price_observation["platform"],
                    price_observation["product_key"],
                    price_observation["product_id"],
                    price_observation["listing_id"],
                    price_observation["seller_id"],
                    price_observation["variant_id"],
                    price_observation["seller"],
                    price_observation["price"],
                    price_observation["currency"],
                    price_observation["source"],
                    price_observation["scrape_confidence"],
                    json.dumps(price_observation["warning_codes"]),
                ),
            )
            inserted["price_observation"] = True

        if seller_snapshot:
            conn.execute(
                """
                INSERT INTO seller_snapshots (
                    observed_at, platform, seller, seller_id, product_key, listing_id,
                    variant_id, category, rating, marketplace_score, follower_count, badges,
                    scrape_confidence, source, warning_codes, missing_fields
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    seller_snapshot["observed_at"],
                    seller_snapshot["platform"],
                    seller_snapshot["seller"],
                    seller_snapshot["seller_id"],
                    seller_snapshot["product_key"],
                    seller_snapshot["listing_id"],
                    seller_snapshot["variant_id"],
                    seller_snapshot["category"],
                    seller_snapshot["rating"],
                    seller_snapshot["marketplace_score"],
                    seller_snapshot["follower_count"],
                    json.dumps(seller_snapshot["badges"]),
                    seller_snapshot["scrape_confidence"],
                    seller_snapshot["source"],
                    json.dumps(seller_snapshot["warning_codes"]),
                    json.dumps([]),
                ),
            )
            inserted["seller_snapshot"] = True

    return {
        "accepted": True,
        "inserted": inserted,
        "product_key": product_observation["product_key"],
    }


def record_external_price_history(product: dict[str, Any]) -> int:
    external = product.get("external_price_history") if isinstance(product.get("external_price_history"), dict) else {}
    prices = external.get("prices") if isinstance(external.get("prices"), dict) else {}
    if not prices:
        return 0

    identity = resolve_product_identity(product)
    product_key = identity.product_key
    platform = identity.platform
    if platform == "unknown":
        return 0

    product_id = identity.product_id or ""
    listing_id = _coerce_text(external.get("listingId") or identity.listing_id)
    seller = _coerce_text(product.get("seller"))
    source = _coerce_text(external.get("source")) or "external_price_history"
    metadata = product.get("scrape_metadata") if isinstance(product.get("scrape_metadata"), dict) else {}
    confidence = _coerce_confidence(metadata.get("confidence"))
    warnings = json.dumps(_warning_codes(metadata.get("warnings")))
    inserted = 0

    with connect() as conn:
        for observed_at, price in sorted(prices.items(), key=lambda item: str(item[0])):
            numeric_price = _coerce_float(price)
            if numeric_price is None:
                continue

            observed_at_text = _coerce_text(observed_at)
            if not observed_at_text:
                observed_at_text = _now_iso()
            if len(observed_at_text) == 10:
                observed_at_text = f"{observed_at_text}T00:00:00+00:00"

            existing = conn.execute(
                """
                SELECT id FROM price_observations
                WHERE platform = ?
                  AND product_key = ?
                  AND COALESCE(listing_id, '') = COALESCE(?, '')
                  AND observed_at = ?
                  AND source = ?
                LIMIT 1
                """,
                (platform, product_key, listing_id or None, observed_at_text, source),
            ).fetchone()
            if existing:
                continue

            conn.execute(
                """
                INSERT INTO price_observations (
                    observed_at, platform, product_key, product_id, listing_id, seller_id,
                    variant_id, seller, price, currency, source, scrape_confidence, warning_codes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    observed_at_text,
                    platform,
                    product_key,
                    product_id or None,
                    listing_id or None,
                    identity.seller_id,
                    identity.variant_id,
                    seller or None,
                    numeric_price,
                    "TRY",
                    source,
                    confidence,
                    warnings,
                ),
            )
            inserted += 1

    return inserted


def observation_from_product(product: dict[str, Any], price_info: dict[str, Any]) -> dict[str, Any]:
    source, scrape_confidence, warning_codes = _metadata_from_product(product)
    seller_metadata = product.get("seller_metadata") if isinstance(product.get("seller_metadata"), dict) else {}
    identity = resolve_product_identity(product)
    return {
        "platform": identity.platform,
        "product_id": identity.product_id,
        "product_key": identity.product_key,
        "listing_id": identity.listing_id,
        "seller_id": identity.seller_id,
        "variant_id": identity.variant_id,
        "category": identity.category,
        "url": identity.canonical_url or product.get("url") or None,
        "title": product.get("title") or None,
        "seller": product.get("seller") or None,
        "price": {
            "value": price_info.get("value"),
            "currency": price_info.get("currency"),
        },
        "seller_snapshot": {
            "seller": product.get("seller") or None,
            "seller_id": identity.seller_id,
            "rating": product.get("rating") or None,
            "marketplace_score": seller_metadata.get("marketplace_seller_score"),
            "follower_count": seller_metadata.get("seller_follower_count"),
            "badges": seller_metadata.get("seller_badges") or [],
        },
        "source": source or "analyze_product",
        "scrape_confidence": scrape_confidence,
        "warning_codes": warning_codes,
    }


def get_history_response(
    platform: str,
    product_id: str | None = None,
    product_key: str | None = None,
    listing_id: str | None = None,
    seller: str | None = None,
    limit: int = 40,
) -> dict[str, Any]:
    platform = _coerce_platform(platform)
    if not product_key and product_id:
        product_key = make_product_key({"platform": platform, "product_id": product_id})
    price_rows = get_price_observations(platform, product_key, listing_id, limit)
    seller_names = [seller] if seller else []
    if not seller_names:
        seller_names = list(dict.fromkeys(
            row["seller"] for row in price_rows if row.get("seller")
        ))[:3]
    seller_rows: list[dict[str, Any]] = []
    for seller_name in seller_names:
        seller_rows.extend(get_shared_seller_snapshots(platform, seller_name or "", limit))
    return {
        "platform": platform,
        "product_key": product_key,
        "listing_id": listing_id,
        "price_history": [
            {
                "observed_at": row["observed_at"],
                "price": row["price"],
                "currency": row["currency"],
                "seller": row["seller"],
                "source": row["source"],
                "scrape_confidence": row["scrape_confidence"],
                "warning_codes": json.loads(row["warning_codes"] or "[]"),
            }
            for row in price_rows
        ],
        "seller_history": [
            {
                "observed_at": row.get("observed_at") or row.get("created_at"),
                "seller": row["seller"],
                "seller_id": row.get("seller_id"),
                "rating": row.get("rating"),
                "marketplace_score": row.get("marketplace_score"),
                "follower_count": row.get("follower_count"),
                "badges": json.loads(row.get("badges") or "[]"),
                "source": row.get("source"),
                "scrape_confidence": row.get("scrape_confidence"),
                "warning_codes": json.loads(row.get("warning_codes") or "[]"),
            }
            for row in seller_rows
        ],
    }


def record_snapshot(
    product: dict[str, Any],
    price_info: dict[str, Any],
    fraud_score: int,
    trust_score: int,
) -> None:
    metadata = product.get("scrape_metadata") or {}
    missing_fields = metadata.get("missingFields") or metadata.get("missing_fields") or []
    if not isinstance(missing_fields, list):
        missing_fields = []

    identity = resolve_product_identity(product)
    product_key = identity.product_key
    platform = identity.platform
    seller = product.get("seller") or ""
    scrape_confidence = metadata.get("confidence")
    if not isinstance(scrape_confidence, int):
        scrape_confidence = None

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO product_snapshots (
                product_key, platform, product_id, listing_id, seller_id, variant_id,
                category, url, title, seller, price_text, price_value, currency,
                rating, review_count, fraud_score, trust_score, scrape_confidence,
                missing_fields
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product_key,
                platform,
                identity.product_id,
                identity.listing_id,
                identity.seller_id,
                identity.variant_id,
                identity.category,
                identity.canonical_url or product.get("url") or None,
                product.get("title") or None,
                seller or None,
                product.get("price") or None,
                price_info.get("value"),
                price_info.get("currency"),
                product.get("rating") or 0.0,
                len(product.get("reviews") or []),
                fraud_score,
                trust_score,
                scrape_confidence,
                json.dumps(missing_fields),
            ),
        )

        if seller and seller != "N/A":
            conn.execute(
                """
                INSERT INTO seller_snapshots (
                    platform, seller, seller_id, product_key, listing_id, variant_id,
                    category, rating, review_count, fraud_score, trust_score,
                    scrape_confidence, missing_fields
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    platform,
                    seller,
                    identity.seller_id,
                    product_key,
                    identity.listing_id,
                    identity.variant_id,
                    identity.category,
                    product.get("rating") or 0.0,
                    len(product.get("reviews") or []),
                    fraud_score,
                    trust_score,
                    scrape_confidence,
                    json.dumps(missing_fields),
                ),
            )

    observation = observation_from_product(product, price_info)
    if observation["price"]["value"] is not None or observation.get("seller"):
        try:
            record_observation(observation)
        except ValueError:
            pass
