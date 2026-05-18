import os
import tempfile
import unittest
from unittest.mock import patch

from services.history_store import get_product_snapshots, make_product_key, record_snapshot
from services.ml_engine import analyze_product_data
from services.trust_signals import build_safer_alternatives, parse_price_text, resolve_current_price


class TrustSignalsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        os.environ["BIBAK_DB_PATH"] = os.path.join(self.tempdir.name, "test.sqlite3")
        self.trendyol_price_patch = patch("services.trust_signals._fetch_trendyol_datalayer_price", return_value=None)
        self.trendyol_price_patch.start()

    def tearDown(self) -> None:
        self.trendyol_price_patch.stop()
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
        fixtures = [
            ("normal_try", "1.299,90 TL", 1299.90, "TRY"),
            ("try_thousands_without_cents", "1.650 TL", 1650, "TRY"),
            ("usd_prefix", "$49.99", 49.99, "USD"),
            ("crossed_price", "Son 10 Günün En Düşük 353,92 TL 350,38 TL", 350.38, "TRY"),
            ("unit_price_suffix", "353,92 TL 350,38 TL (3,89 TL / Tablet)", 350.38, "TRY"),
            ("basket_discount", "Sepette %40 İndirim\nSepette 990 TL\n1.650 TL", 990, "TRY"),
            ("trendyol_plus_basket_price", "Trendyol Plus'a Özel\nSepette\n436,99 TL\n459,99 TL", 436.99, "TRY"),
            ("coupon_only", "15 TL Kupon Fırsatı!", 15, "TRY"),
            ("unit_only", "3,89 TL / Tablet", None, None),
            ("missing_price", "Son 10 ürün kaldı", None, None),
        ]

        for name, text, expected_value, expected_currency in fixtures:
            with self.subTest(name=name):
                parsed = parse_price_text(text)
                self.assertEqual(parsed["value"], expected_value)
                self.assertEqual(parsed["currency"], expected_currency)

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
        self.assertIn("düşük görünüyor", result["price_analysis"]["explanation"])
        self.assertIn("live_price_differs_from_history", result["warnings"])
        self.assertIn("farklı satıcı/listing", result["price_analysis"]["explanation"])
        self.assertFalse(any("Güncel fiyat gözlenen fiyat geçmişiyle uyumlu." == explanation for explanation in result["explanations"]))
        self.assertIn("iyi görünüyor", result["purchase_timing"]["reason"])

    def test_trendyol_datalayer_price_overrides_wrong_scraped_price(self) -> None:
        product = self._product("517,50 TL")
        product["url"] = "https://www.trendyol.com/icollagen/kolajen-ve-prebiyotik-tablet-p-752356123"
        product["parsed_price"] = {"value": 517.5, "currency": "TRY", "raw": "517,50 TL"}

        with patch("services.trust_signals._fetch_trendyol_datalayer_price", return_value=350.0):
            price_info = resolve_current_price(product)
            result = analyze_product_data(product)

        self.assertEqual(price_info["value"], 350.0)
        self.assertEqual(price_info["source"], "trendyol_datalayer")
        self.assertEqual(result["price_analysis"]["current_price"], 350.0)
        self.assertIn("scraped_price_overridden_by_trendyol_datalayer", result["warnings"])

    def test_trendyol_plus_basket_discount_is_not_overridden_by_datalayer(self) -> None:
        product = self._product("436,99 TL")
        product["url"] = "https://www.trendyol.com/altinyildiz-classics/erkek-ac-premiere-ozel-seri-uzun-sure-kalici-koku-edp-parfum-100-ml-p-81087871"
        product["parsed_price"] = {"value": 436.99, "currency": "TRY", "raw": "436,99 TL"}

        with patch("services.trust_signals._fetch_trendyol_datalayer_price", return_value=459.99):
            price_info = resolve_current_price(product)
            result = analyze_product_data(product)

        self.assertEqual(price_info["value"], 436.99)
        self.assertNotEqual(price_info.get("source"), "trendyol_datalayer")
        self.assertEqual(result["price_analysis"]["current_price"], 436.99)
        self.assertNotIn("scraped_price_overridden_by_trendyol_datalayer", result["warnings"])

    def test_trendyol_basket_discount_below_datalayer_is_kept(self) -> None:
        product = self._product("696,79 TL")
        product["url"] = "https://www.trendyol.com/avva/erkek-black-hediye-kutulu-parfum-100-ml-b009102-p-4236775"
        product["parsed_price"] = {"value": 696.79, "currency": "TRY", "raw": "696,79 TL"}

        with patch("services.trust_signals._fetch_trendyol_datalayer_price", return_value=1071.99):
            price_info = resolve_current_price(product)
            result = analyze_product_data(product)

        self.assertEqual(price_info["value"], 696.79)
        self.assertNotEqual(price_info.get("source"), "trendyol_datalayer")
        self.assertEqual(result["price_analysis"]["current_price"], 696.79)
        self.assertNotIn("scraped_price_overridden_by_trendyol_datalayer", result["warnings"])

    def test_seller_analysis_uses_observed_history(self) -> None:
        analyze_product_data(self._product("100 TL", title="BiBak Test Blender A"))
        result = analyze_product_data(self._product("110 TL", title="BiBak Test Blender B"))

        self.assertGreaterEqual(result["seller_analysis"]["history_count"], 2)
        self.assertGreater(result["seller_reliability_score"], 50)

    def test_trendyol_seller_metadata_drives_seller_reliability(self) -> None:
        product = self._product("609,90 TL", title="Avene Cicalfate Cream")
        product["seller"] = "Kozvit"
        product["seller_metadata"] = {
            "seller_name": "Kozvit",
            "marketplace_seller_score": 9.6,
            "seller_follower_count": 253400,
            "seller_badges": ["Hızlı Satıcı", "Kargo Bedava"],
            "fast_delivery_available": True,
            "free_shipping_available": True,
        }

        result = analyze_product_data(product)

        self.assertGreaterEqual(result["seller_reliability_score"], 75)
        self.assertIn("seller_core_score", result["seller_analysis"])
        self.assertGreaterEqual(result["seller_analysis"]["seller_context_adjustment"], -5)
        self.assertTrue(
            any("marketplace rating" in explanation for explanation in result["seller_analysis"]["explanations"])
        )
        self.assertNotIn("average_rating", result["seller_analysis"])
        self.assertNotIn("heuristic_history_score", result["seller_analysis"])

    def test_turkish_seller_explanations_are_localized(self) -> None:
        product = self._product("609,90 TL", title="Avene Cicalfate Cream")
        product["locale"] = "tr"
        product["seller"] = "Kozvit"
        product["seller_metadata"] = {
            "seller_name": "Kozvit",
            "marketplace_seller_score": 9.6,
            "seller_follower_count": 253400,
            "seller_badges": ["Hızlı Satıcı", "Kargo Bedava"],
            "fast_delivery_available": True,
            "free_shipping_available": True,
        }

        result = analyze_product_data(product)

        self.assertTrue(
            any("Satıcının pazar yeri puanı" in explanation for explanation in result["seller_analysis"]["explanations"])
        )
        self.assertFalse(
            any("Seller has" in explanation for explanation in result["seller_analysis"]["explanations"])
        )

    def test_safer_alternatives_require_similarity_reviews_and_sane_price(self) -> None:
        current = self._product("100 TL", title="BiBak Test Blender 600W Glass Cup")
        similar = self._product("95 TL", title="BiBak Test Blender 600W Steel Cup")
        unrelated = self._product("20 TL", title="Running Shoes Outdoor")
        thin_reviews = self._product("90 TL", title="BiBak Test Blender 600W Compact")
        current["product_id"] = "current"
        similar["product_id"] = "similar"
        unrelated["product_id"] = "unrelated"
        thin_reviews["product_id"] = "thin"
        thin_reviews["reviews"] = ["Short review"]

        record_snapshot(similar, {"value": 95, "currency": "TRY"}, fraud_score=12, trust_score=88)
        record_snapshot(unrelated, {"value": 20, "currency": "TRY"}, fraud_score=5, trust_score=95)
        record_snapshot(thin_reviews, {"value": 90, "currency": "TRY"}, fraud_score=5, trust_score=96)

        alternatives = build_safer_alternatives(current, trust_score=72, price_score=55)

        self.assertEqual(len(alternatives), 1)
        self.assertEqual(alternatives[0]["title"], similar["title"])
        self.assertGreaterEqual(alternatives[0]["similarity"], 0.42)


if __name__ == "__main__":
    unittest.main()
