from __future__ import annotations

from typing import Any


TRUSTWORTHY_MARKETPLACE_SELLER: dict[str, Any] = {
    "seller_metadata": {
        "seller_id": "seller_trust_001",
        "seller_name": "Kozvit",
        "marketplace_seller_score": 9.6,
        "seller_follower_count": 253_400,
        "seller_badges": ["Hızlı Satıcı", "Kargo Bedava"],
        "fast_delivery_available": True,
        "free_shipping_available": True,
        "store_url": "https://www.trendyol.com/magaza/kozvit-m-123",
        "observed_seller_history_count": 6,
        "observed_product_count": 4,
        "avg_historical_trust_score": 88,
        "avg_historical_fraud_score": 12,
    },
    "review_analysis": {"fraud_score": 10, "review_authenticity_score": 90},
    "pricing_signals": [],
}


NEW_BUT_PROMISING_SELLER: dict[str, Any] = {
    "seller_metadata": {
        "seller_id": "seller_new_204",
        "seller_name": "Dermokozmetik Plus",
        "marketplace_seller_score": 9.2,
        "seller_follower_count": 8_500,
        "seller_badges": ["Kargo Bedava"],
        "fast_delivery_available": False,
        "free_shipping_available": True,
        "store_url": "https://www.trendyol.com/magaza/dermokozmetik-plus-m-204",
        "observed_seller_history_count": 1,
        "observed_product_count": 1,
    },
    "review_analysis": {"fraud_score": 18, "review_authenticity_score": 82},
    "pricing_signals": [],
}


WEAK_IDENTITY_SELLER: dict[str, Any] = {
    "seller_metadata": {
        "seller_id": "seller_unknown_771",
        "seller_name": "Flash Deal Store",
        "observed_seller_history_count": 0,
        "observed_product_count": 0,
    },
    "review_analysis": {"fraud_score": 12, "review_authenticity_score": 88},
    "pricing_signals": [],
}


LOW_MARKETPLACE_SCORE_SELLER: dict[str, Any] = {
    "seller_metadata": {
        "seller_id": "seller_low_099",
        "seller_name": "Outlet Mega Saver",
        "marketplace_seller_score": 6.1,
        "seller_follower_count": 420,
        "seller_badges": [],
        "fast_delivery_available": False,
        "free_shipping_available": False,
        "observed_seller_history_count": 4,
        "observed_product_count": 3,
        "avg_historical_trust_score": 54,
        "avg_historical_fraud_score": 38,
    },
    "review_analysis": {"fraud_score": 8, "review_authenticity_score": 92},
    "pricing_signals": [],
}


SELLER_SCENARIOS: dict[str, dict[str, Any]] = {
    "trustworthy_marketplace_seller": TRUSTWORTHY_MARKETPLACE_SELLER,
    "new_but_promising_seller": NEW_BUT_PROMISING_SELLER,
    "weak_identity_seller": WEAK_IDENTITY_SELLER,
    "low_marketplace_score_seller": LOW_MARKETPLACE_SCORE_SELLER,
}
