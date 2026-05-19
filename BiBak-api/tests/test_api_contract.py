import unittest
import os
import tempfile
from unittest.mock import patch

from main import flask_app
from models.api_models import ProductRequest
from services.ml_engine import analyze_product_data


class ApiContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        os.environ["BIBAK_DB_PATH"] = os.path.join(self.tempdir.name, "test.sqlite3")
        self.client = flask_app.test_client()

    def tearDown(self) -> None:
        os.environ.pop("BIBAK_DB_PATH", None)
        self.tempdir.cleanup()

    def test_rejects_non_object_json(self) -> None:
        response = self.client.post(
            "/analyze-product",
            data="[]",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Request body must be a JSON object")

    def test_product_request_normalizes_scraped_payload(self) -> None:
        payload = ProductRequest.from_dict({
            "title": None,
            "price": " 99 TL ",
            "seller": None,
            "rating": "bad",
            "locale": "de",
            "reviews": [" Good product ", "", 42],
        })

        self.assertEqual(payload.title, "")
        self.assertEqual(payload.price, "99 TL")
        self.assertEqual(payload.seller, "")
        self.assertEqual(payload.rating, 0.0)
        self.assertEqual(payload.locale, "tr")
        self.assertEqual(payload.reviews, ["Good product"])
        self.assertEqual(payload.platform, "unknown")
        self.assertEqual(payload.scrape_metadata, {})
        self.assertEqual(payload.external_price_history, {})

    def test_limited_review_response_keeps_contract(self) -> None:
        response = self.client.post("/analyze-product", json={"reviews": ["Only one"], "rating": "4.5"})

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["source"], "api")
        self.assertIn("limited_review_data", data["warnings"])
        self.assertIsNone(data["review_analysis"])
        self.assertIsInstance(data["risk_flags"], list)

    def test_unavailable_review_text_does_not_claim_no_reviews(self) -> None:
        response = self.client.post("/analyze-product", json={
            "reviews": [],
            "rating": "4.5",
            "scrape_metadata": {
                "reviewCount": 1243,
                "warnings": ["review_text_unavailable"],
                "confidence": 70,
            },
        })

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("review_text_unavailable", data["warnings"])
        self.assertNotIn("no_reviews", data["warnings"])
        self.assertIn("1243", data["explanations"][0])

    def test_pipeline_failure_returns_fallback_contract(self) -> None:
        with patch("services.ml_engine.analyze_reviews", side_effect=RuntimeError("boom")):
            result = analyze_product_data({
                "reviews": ["Great product with enough detail", "Another detailed product review"],
                "rating": "4.0",
                "price": "100 TL",
                "seller": "Store",
            })

        self.assertEqual(result["source"], "fallback")
        self.assertIn("ml_pipeline_failed", result["warnings"])
        self.assertIsNone(result["review_analysis"])


if __name__ == "__main__":
    unittest.main()
