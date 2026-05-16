import os
import tempfile
import unittest

from services.history_store import get_product_snapshots, make_product_key
from services.ml_engine import analyze_product_data
from services.trust_signals import parse_price_text


class TrustSignalsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        os.environ["BIBAK_DB_PATH"] = os.path.join(self.tempdir.name, "test.sqlite3")

    def tearDown(self) -> None:
        os.environ.pop("BIBAK_DB_PATH", None)
        self.tempdir.cleanup()

    def _product(self, price: str, title: str = "BiBak Test Blender") -> dict:
        return {
            "title": title,
            "price": price,
            "seller": "Trusted Store",
            "rating": 4.4,
            "locale": "en",
            "platform": "trendyol",
            "product_id": "123",
            "url": "https://www.trendyol.com/test-p-123",
            "scrape_metadata": {
                "confidence": 90,
                "reviewCount": 4,
                "missingFields": [],
                "warnings": [],
                "source": "dom",
            },
            "reviews": [
                "I have used this blender for two months and it works well for smoothies.",
                "The motor is solid, cleanup is easy, and the cup size is practical.",
                "Good value for the price after daily use in a small kitchen.",
            ],
        }

    def test_parse_price_text_handles_try_and_usd(self) -> None:
        self.assertEqual(parse_price_text("1.299,90 TL")["value"], 1299.90)
        self.assertEqual(parse_price_text("$49.99")["currency"], "USD")
        self.assertEqual(parse_price_text("Son 10 Günün En Düşük 353,92 TL 350,38 TL")["value"], 350.38)
        self.assertEqual(parse_price_text("353,92 TL 350,38 TL (3,89 TL / Tablet)")["value"], 350.38)
        self.assertEqual(parse_price_text("Sepette %40 İndirim\nSepette 990 TL\n1.650 TL")["value"], 990)
        self.assertIsNone(parse_price_text("3,89 TL / Tablet")["value"])
        self.assertIsNone(parse_price_text("Son 10 ürün kaldı")["value"])

    def test_analysis_records_snapshots_and_returns_price_history(self) -> None:
        analyze_product_data(self._product("100 TL"))
        result = analyze_product_data(self._product("130 TL"))

        product_key = make_product_key(result_product := self._product("130 TL"))
        self.assertEqual(len(get_product_snapshots(product_key)), 2)
        self.assertEqual(result["price_analysis"]["history_count"], 1)
        self.assertIn("insufficient_price_history", result["warnings"])
        self.assertIn("purchase_timing", result)
        self.assertEqual(result_product["product_id"], "123")

    def test_price_history_flags_suspicious_discount_after_spike(self) -> None:
        analyze_product_data(self._product("100 TL"))
        analyze_product_data(self._product("102 TL"))
        analyze_product_data(self._product("160 TL"))
        result = analyze_product_data(self._product("101 TL"))

        self.assertEqual(result["price_analysis"]["discount_risk"], "suspicious_discount")
        self.assertLess(result["price_integrity_score"], 60)
        self.assertIn("suspicious_discount_pattern", result["warnings"])

    def test_external_trendyol_history_is_preferred_over_local_history(self) -> None:
        product = self._product("750 TL")
        product["external_price_history"] = {
            "source": "trendyol_internal",
            "listingId": "listing-1",
            "contentId": "123",
            "prices": {
                "2026-05-01": 1119.9,
                "2026-05-02": 1119.9,
                "2026-05-03": 750,
                "2026-05-04": 750,
            },
        }

        result = analyze_product_data(product)

        self.assertEqual(result["price_analysis"]["source"], "trendyol_internal")
        self.assertEqual(result["price_analysis"]["history_count"], 4)
        self.assertGreaterEqual(result["price_analysis"]["confidence"], 80)

    def test_live_price_below_trendyol_history_is_not_called_consistent(self) -> None:
        product = self._product("350 TL")
        product["locale"] = "tr"
        product["external_price_history"] = {
            "source": "trendyol_internal",
            "listingId": "listing-1",
            "contentId": "123",
            "prices": {
                "2026-05-04": 645,
                "2026-05-05": 645,
                "2026-05-06": 645,
                "2026-05-09": 575,
                "2026-05-14": 575,
            },
        }

        result = analyze_product_data(product)

        self.assertEqual(result["price_analysis"]["discount_risk"], "below_history")
        self.assertEqual(result["price_analysis"]["observed_low"], 350)
        self.assertEqual(result["price_analysis"]["observed_average"], 617)
        self.assertEqual(result["price_analysis"]["latest_history_price"], 575)
        self.assertIn("belirgin altında", result["price_analysis"]["explanation"])
        self.assertIn("live_price_differs_from_history", result["warnings"])
        self.assertFalse(any("Güncel fiyat gözlenen fiyat geçmişiyle uyumlu." == explanation for explanation in result["explanations"]))
        self.assertIn("belirgin altında", result["purchase_timing"]["reason"])

    def test_seller_analysis_uses_observed_history(self) -> None:
        analyze_product_data(self._product("100 TL", title="BiBak Test Blender A"))
        result = analyze_product_data(self._product("110 TL", title="BiBak Test Blender B"))

        self.assertGreaterEqual(result["seller_analysis"]["history_count"], 2)
        self.assertGreater(result["seller_reliability_score"], 50)


if __name__ == "__main__":
    unittest.main()
