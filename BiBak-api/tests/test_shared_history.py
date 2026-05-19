import os
import tempfile
import unittest
from unittest.mock import patch

from main import flask_app
from services.ml_engine import analyze_product_data


class SharedHistoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        os.environ["BIBAK_DB_PATH"] = os.path.join(self.tempdir.name, "test.sqlite3")
        self.client = flask_app.test_client()
        self.trendyol_price_patch = patch("services.trust_signals._fetch_trendyol_datalayer_price", return_value=None)
        self.trendyol_price_patch.start()

    def tearDown(self) -> None:
        self.trendyol_price_patch.stop()
        os.environ.pop("BIBAK_DB_PATH", None)
        self.tempdir.cleanup()

    def _observation(self, price: float) -> dict:
        return {
            "platform": "trendyol",
            "product_id": "shared-123",
            "listing_id": "listing-abc",
            "title": "Shared History Test Product",
            "seller": "Shared Store",
            "price": {"value": price, "currency": "TRY"},
            "source": "test",
            "scrape_confidence": 92,
            "warning_codes": ["low_review_count"],
            "seller_snapshot": {
                "seller": "Shared Store",
                "marketplace_score": 9.4,
                "follower_count": 2500,
                "badges": ["fast_seller"],
            },
        }

    def _product(self, price: str) -> dict:
        return {
            "title": "Shared History Test Product",
            "price": price,
            "seller": "Shared Store",
            "rating": 4.7,
            "locale": "en",
            "platform": "trendyol",
            "product_id": "shared-123",
            "url": "https://www.trendyol.com/test-p-shared-123",
            "scrape_metadata": {
                "listingId": "listing-abc",
                "source": "dom",
                "confidence": 90,
                "reviewCount": 0,
                "missingFields": [],
                "warnings": [],
            },
            "reviews": [],
        }

    def test_observe_accepts_valid_payload(self) -> None:
        response = self.client.post("/history/observe", json=self._observation(100))

        self.assertEqual(response.status_code, 201)
        data = response.get_json()
        self.assertTrue(data["accepted"])
        self.assertTrue(data["inserted"]["product_observation"])
        self.assertTrue(data["inserted"]["price_observation"])
        self.assertTrue(data["inserted"]["seller_snapshot"])

    def test_observe_rejects_malformed_payload(self) -> None:
        response = self.client.post("/history/observe", json={"platform": "trendyol", "price": "bad"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Invalid observation payload")

    def test_price_history_can_be_recorded_and_read_back(self) -> None:
        self.client.post("/history/observe", json=self._observation(100))
        self.client.post("/history/observe", json=self._observation(95))

        response = self.client.get(
            "/history/product",
            query_string={
                "platform": "trendyol",
                "product_id": "shared-123",
                "listing_id": "listing-abc",
                "seller": "Shared Store",
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual([row["price"] for row in data["price_history"]], [100, 95])
        self.assertEqual(data["price_history"][0]["warning_codes"], ["low_review_count"])
        self.assertEqual(data["seller_history"][0]["marketplace_score"], 9.4)

    def test_analyze_product_uses_previously_stored_shared_price_observations(self) -> None:
        for price in (100, 102, 160):
            self.client.post("/history/observe", json=self._observation(price))

        result = analyze_product_data(self._product("101 TL"))

        self.assertEqual(result["price_analysis"]["source"], "shared_history")
        self.assertEqual(result["price_analysis"]["history_count"], 3)
        self.assertEqual(result["price_analysis"]["discount_risk"], "suspicious_discount")
        self.assertIn("suspicious_discount_pattern", result["warnings"])

    def test_analysis_does_not_reintroduce_safer_alternatives(self) -> None:
        result = analyze_product_data(self._product("101 TL"))

        self.assertNotIn("safer_alternatives", result)
        self.assertFalse(any("recommend" in key for key in result.keys()))


if __name__ == "__main__":
    unittest.main()
