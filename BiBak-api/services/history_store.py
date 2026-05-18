import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any


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
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_key ON product_snapshots(product_key, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seller ON seller_snapshots(platform, seller, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_platform ON product_snapshots(platform, created_at)")


def make_product_key(product: dict[str, Any]) -> str:
    platform = product.get("platform") or "unknown"
    product_id = product.get("product_id")
    if product_id:
        return f"{platform}:{product_id}"

    title = " ".join(str(product.get("title") or "").lower().split())
    seller = " ".join(str(product.get("seller") or "").lower().split())
    url = str(product.get("url") or "").split("?")[0]
    identity = title or url or "unknown-product"
    return f"{platform}:{identity}:{seller}"


def get_product_snapshots(product_key: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM product_snapshots
            WHERE product_key = ?
            ORDER BY created_at ASC, id ASC
            """,
            (product_key,),
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

    product_key = make_product_key(product)
    platform = product.get("platform") or "unknown"
    seller = product.get("seller") or ""
    scrape_confidence = metadata.get("confidence")
    if not isinstance(scrape_confidence, int):
        scrape_confidence = None

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO product_snapshots (
                product_key, platform, product_id, url, title, seller, price_text,
                price_value, currency, rating, review_count, fraud_score, trust_score,
                scrape_confidence, missing_fields
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product_key,
                platform,
                product.get("product_id") or None,
                product.get("url") or None,
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
                    platform, seller, product_key, rating, review_count, fraud_score,
                    trust_score, scrape_confidence, missing_fields
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    platform,
                    seller,
                    product_key,
                    product.get("rating") or 0.0,
                    len(product.get("reviews") or []),
                    fraud_score,
                    trust_score,
                    scrape_confidence,
                    json.dumps(missing_fields),
                ),
            )

